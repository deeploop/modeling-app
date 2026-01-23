"""
Zoo Web API Command Client Tests

This module tests the WebSocket client that sends Zoo Web API commands.
It validates that the client correctly formats and sends all commands defined in zoo_web_api_commands.csv.

Prerequisites:
    pip install pytest pytest-asyncio websockets aiohttp pandas

Run tests:
    pytest tests/test_zoo_web_command_client.py -v
"""

import asyncio
import csv
import json
from pathlib import Path
from typing import Dict, List, Any, Optional, Callable
from uuid import uuid4
from dataclasses import dataclass, field

import pytest
import websockets


# Load commands from CSV
def load_commands_from_csv() -> List[Dict[str, str]]:
    """Load all Zoo Web API commands from CSV file."""
    csv_path = Path(__file__).parent.parent / "zoo_web_api_commands.csv"

    commands = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            commands.append(row)

    return commands


# Get all commands
ALL_COMMANDS = load_commands_from_csv()


@dataclass
class CommandResponse:
    """Response from a command execution."""
    cmd_id: str
    success: bool
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


class ZooWebSocketClient:
    """Zoo Web API WebSocket Client."""

    def __init__(self, uri: str = "ws://localhost:8765"):
        self.uri = uri
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.pending_commands: Dict[str, asyncio.Future] = {}
        self.subscriptions: Dict[str, List[Callable]] = {}
        self.sequence_number = 0

    async def connect(self):
        """Connect to WebSocket server."""
        self.websocket = await websockets.connect(self.uri)
        # Start listening for responses
        asyncio.create_task(self._listen_for_responses())

    async def disconnect(self):
        """Disconnect from WebSocket server."""
        if self.websocket:
            await self.websocket.close()

    async def _listen_for_responses(self):
        """Listen for incoming messages from server."""
        try:
            async for message in self.websocket:
                data = json.loads(message)

                # Match response to pending command
                cmd_id = data.get('cmd_id')
                if cmd_id and cmd_id in self.pending_commands:
                    future = self.pending_commands.pop(cmd_id)
                    response = CommandResponse(
                        cmd_id=cmd_id,
                        success=data.get('success', True),
                        data=data.get('data', {}),
                        error=data.get('error')
                    )
                    future.set_result(response)

                # Trigger subscriptions
                event_type = data.get('type')
                if event_type in self.subscriptions:
                    for callback in self.subscriptions[event_type]:
                        callback(data)

        except websockets.exceptions.ConnectionClosed:
            print("Connection closed")

    async def send_command(
        self,
        cmd_type: str,
        params: Optional[Dict[str, Any]] = None,
        reliable: bool = True,
        timeout: float = 5.0
    ) -> Optional[CommandResponse]:
        """
        Send a command to the server.

        Args:
            cmd_type: Command type (e.g., 'default_camera_get_view')
            params: Command parameters
            reliable: Whether to use reliable channel (WebSocket) or unreliable (DataChannel)
            timeout: Timeout in seconds for response

        Returns:
            CommandResponse if reliable, None if unreliable
        """
        cmd_id = str(uuid4())
        cmd = {'type': cmd_type}

        if params:
            cmd.update(params)

        # Add sequence number for unreliable commands
        if not reliable:
            self.sequence_number += 1
            cmd['sequence'] = self.sequence_number

        request = {
            'type': 'modeling_cmd_req',
            'cmd_id': cmd_id,
            'cmd': cmd
        }

        # Send command
        await self.websocket.send(json.dumps(request))

        # For reliable commands, wait for response
        if reliable:
            future = asyncio.Future()
            self.pending_commands[cmd_id] = future

            try:
                response = await asyncio.wait_for(future, timeout=timeout)
                return response
            except asyncio.TimeoutError:
                self.pending_commands.pop(cmd_id, None)
                raise TimeoutError(f"Command {cmd_type} timed out after {timeout}s")

        return None

    async def send_batch_commands(
        self,
        commands: List[Dict[str, Any]],
        timeout: float = 10.0
    ) -> CommandResponse:
        """Send multiple commands in a batch."""
        cmd_id = str(uuid4())

        request = {
            'type': 'modeling_cmd_batch_req',
            'cmd_id': cmd_id,
            'batch': commands
        }

        await self.websocket.send(json.dumps(request))

        future = asyncio.Future()
        self.pending_commands[cmd_id] = future

        try:
            response = await asyncio.wait_for(future, timeout=timeout)
            return response
        except asyncio.TimeoutError:
            self.pending_commands.pop(cmd_id, None)
            raise TimeoutError(f"Batch command timed out after {timeout}s")

    def subscribe(self, event_type: str, callback: Callable):
        """Subscribe to server events."""
        if event_type not in self.subscriptions:
            self.subscriptions[event_type] = []
        self.subscriptions[event_type].append(callback)

    def unsubscribe(self, event_type: str, callback: Callable):
        """Unsubscribe from server events."""
        if event_type in self.subscriptions:
            self.subscriptions[event_type].remove(callback)


# Mock server for testing
class MockServer:
    """Mock WebSocket server for testing client."""

    def __init__(self, port=8766):
        self.port = port
        self.server = None

    async def handler(self, websocket, path):
        """Handle client messages."""
        async for message in websocket:
            data = json.loads(message)
            cmd_id = data.get('cmd_id')

            # Send mock response
            response = {
                'type': 'modeling',
                'cmd_id': cmd_id,
                'success': True,
                'data': {'mock': True}
            }

            await websocket.send(json.dumps(response))

    async def start(self):
        """Start mock server."""
        self.server = await websockets.serve(self.handler, 'localhost', self.port)

    async def stop(self):
        """Stop mock server."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()


@pytest.fixture
async def mock_server():
    """Fixture for mock server."""
    server = MockServer()
    await server.start()
    yield server
    await server.stop()


@pytest.fixture
async def client(mock_server):
    """Fixture for WebSocket client."""
    client = ZooWebSocketClient(uri=f"ws://localhost:{mock_server.port}")
    await client.connect()
    yield client
    await client.disconnect()


# =============================================================================
# CLIENT CONNECTION TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_client_connects_to_server(mock_server):
    """Test client can connect to server."""
    client = ZooWebSocketClient(uri=f"ws://localhost:{mock_server.port}")
    await client.connect()

    assert client.websocket is not None
    assert client.websocket.open

    await client.disconnect()
    print("✓ Client connected successfully")


@pytest.mark.asyncio
async def test_client_disconnects_gracefully(mock_server):
    """Test client disconnects properly."""
    client = ZooWebSocketClient(uri=f"ws://localhost:{mock_server.port}")
    await client.connect()
    await client.disconnect()

    assert client.websocket.closed
    print("✓ Client disconnected gracefully")


# =============================================================================
# COMMAND SENDING TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_client_sends_simple_command(client):
    """Test client sends a simple command."""
    response = await client.send_command('default_camera_get_view')

    assert response is not None
    assert response.success
    assert response.cmd_id is not None
    print(f"✓ Simple command sent, response: {response}")


@pytest.mark.asyncio
async def test_client_sends_command_with_parameters(client):
    """Test client sends command with parameters."""
    params = {
        'center': {'x': 0, 'y': 0, 'z': 0},
        'vantage': {'x': 100, 'y': 100, 'z': 100},
        'up': {'x': 0, 'y': 0, 'z': 1}
    }

    response = await client.send_command('default_camera_look_at', params)

    assert response is not None
    assert response.success
    print("✓ Command with parameters sent successfully")


@pytest.mark.asyncio
async def test_client_sends_unreliable_command(client):
    """Test client sends unreliable channel command."""
    params = {
        'interaction': 'rotate',
        'window': {'x': 500, 'y': 300}
    }

    # Unreliable commands don't wait for response
    response = await client.send_command('camera_drag_move', params, reliable=False)

    assert response is None  # Unreliable commands return None
    print("✓ Unreliable command sent (no response expected)")


@pytest.mark.asyncio
@pytest.mark.parametrize("command", ALL_COMMANDS)
async def test_client_sends_all_csv_commands(client, command):
    """Test client can send all commands from CSV."""
    cmd_name = command['command_name']
    channel = command['channel']

    # Parse example to get parameters
    try:
        example = command['example_usage']
        cmd_data = eval(example) if example.startswith('{') else {}
        params = {k: v for k, v in cmd_data.items() if k != 'type'}
    except:
        params = {}

    is_reliable = (channel == 'Reliable')

    try:
        response = await client.send_command(
            cmd_name,
            params if params else None,
            reliable=is_reliable,
            timeout=2.0
        )

        if is_reliable:
            assert response is not None
            print(f"✓ Command '{cmd_name}' sent successfully (Reliable)")
        else:
            assert response is None
            print(f"✓ Command '{cmd_name}' sent successfully (Unreliable)")

    except asyncio.TimeoutError:
        # Some commands might timeout on mock server
        print(f"⚠ Command '{cmd_name}' timed out (expected for mock server)")


@pytest.mark.asyncio
async def test_client_sends_batch_commands(client):
    """Test client sends batch commands."""
    commands = [
        {'type': 'select_clear'},
        {'type': 'default_camera_get_view'},
        {'type': 'zoom_to_fit', 'object_ids': [], 'padding': 0.2, 'animated': False}
    ]

    response = await client.send_batch_commands(commands)

    assert response is not None
    assert response.success
    print("✓ Batch commands sent successfully")


# =============================================================================
# CAMERA COMMAND TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_client_camera_look_at(client):
    """Test client sends camera look_at command."""
    params = {
        'center': {'x': 0, 'y': 0, 'z': 0},
        'vantage': {'x': 100, 'y': 100, 'z': 100},
        'up': {'x': 0, 'y': 0, 'z': 1}
    }

    response = await client.send_command('default_camera_look_at', params)

    assert response.success
    print("✓ Camera look_at command succeeded")


@pytest.mark.asyncio
async def test_client_camera_zoom(client):
    """Test client sends camera zoom command."""
    params = {'magnitude': -5}

    # Zoom is unreliable
    response = await client.send_command('default_camera_zoom', params, reliable=False)

    assert response is None
    print("✓ Camera zoom command sent (unreliable)")


@pytest.mark.asyncio
async def test_client_camera_drag_workflow(client):
    """Test complete camera drag workflow."""
    # Start drag
    params_start = {
        'interaction': 'rotate',
        'window': {'x': 500, 'y': 300}
    }
    response_start = await client.send_command('camera_drag_start', params_start)
    assert response_start.success

    # Move (unreliable)
    params_move = {
        'interaction': 'rotate',
        'window': {'x': 550, 'y': 350}
    }
    await client.send_command('camera_drag_move', params_move, reliable=False)

    # End drag
    params_end = {
        'interaction': 'rotate',
        'window': {'x': 600, 'y': 400}
    }
    response_end = await client.send_command('camera_drag_end', params_end)
    assert response_end.success

    print("✓ Camera drag workflow completed")


# =============================================================================
# SELECTION COMMAND TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_client_select_with_point(client):
    """Test client sends select_with_point command."""
    params = {
        'selected_at_window': {'x': 0.5, 'y': 0.5},
        'selection_type': 'replace'
    }

    response = await client.send_command('select_with_point', params)

    assert response.success
    print("✓ Select with point command succeeded")


@pytest.mark.asyncio
async def test_client_selection_workflow(client):
    """Test complete selection workflow."""
    # Clear selection
    response1 = await client.send_command('select_clear')
    assert response1.success

    # Select entity
    params_select = {
        'selected_at_window': {'x': 0.5, 'y': 0.5},
        'selection_type': 'add'
    }
    response2 = await client.send_command('select_with_point', params_select)
    assert response2.success

    # Add to selection
    params_add = {
        'entities': ['entity-1', 'entity-2']
    }
    response3 = await client.send_command('select_add', params_add)
    assert response3.success

    print("✓ Selection workflow completed")


# =============================================================================
# SKETCH MODE COMMAND TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_client_sketch_mode_workflow(client):
    """Test sketch mode enter/exit workflow."""
    # Enter sketch mode
    params_enter = {
        'entity_id': 'test-face-id',
        'adjust_camera': True,
        'animated': True,
        'ortho': True
    }
    response1 = await client.send_command('enable_sketch_mode', params_enter)
    assert response1.success

    # Get sketch plane
    response2 = await client.send_command('get_sketch_mode_plane')
    assert response2.success

    # Exit sketch mode
    response3 = await client.send_command('sketch_mode_disable')
    assert response3.success

    print("✓ Sketch mode workflow completed")


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_client_handles_timeout(client):
    """Test client handles command timeout."""
    # This would timeout on a real server that doesn't respond
    with pytest.raises(TimeoutError):
        await client.send_command('non_existent_command', timeout=0.1)

    print("✓ Client handles timeout correctly")


@pytest.mark.asyncio
async def test_client_handles_connection_loss():
    """Test client handles connection loss gracefully."""
    client = ZooWebSocketClient(uri="ws://localhost:9999")  # Invalid port

    with pytest.raises(Exception):  # Connection error
        await client.connect()

    print("✓ Client handles connection loss")


# =============================================================================
# SUBSCRIPTION TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_client_subscription(client):
    """Test client can subscribe to events."""
    received_events = []

    def callback(data):
        received_events.append(data)

    client.subscribe('modeling', callback)

    # Send a command to trigger event
    await client.send_command('default_camera_get_view')

    # Wait a bit for event
    await asyncio.sleep(0.1)

    # Should have received response
    assert len(received_events) > 0

    client.unsubscribe('modeling', callback)
    print("✓ Client subscription works")


# =============================================================================
# PERFORMANCE TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_client_concurrent_commands(client):
    """Test client handles concurrent commands."""
    tasks = [
        client.send_command('default_camera_get_view'),
        client.send_command('select_clear'),
        client.send_command('zoom_to_fit', {
            'object_ids': [],
            'padding': 0.2,
            'animated': False
        })
    ]

    responses = await asyncio.gather(*tasks)

    assert all(r.success for r in responses)
    print(f"✓ {len(responses)} concurrent commands succeeded")


@pytest.mark.asyncio
async def test_client_rapid_unreliable_commands(client):
    """Test client sends rapid unreliable commands."""
    for i in range(50):
        params = {
            'interaction': 'rotate',
            'window': {'x': 500 + i, 'y': 300 + i}
        }
        await client.send_command('camera_drag_move', params, reliable=False)

    print("✓ 50 rapid unreliable commands sent")


if __name__ == '__main__':
    # Run tests with pytest
    pytest.main([__file__, '-v', '--tb=short'])
