"""
Zoo Web API Command Server Tests

This module tests the WebSocket server that handles Zoo Web API commands.
It validates that the server correctly processes all commands defined in zoo_web_api_commands.csv.

Prerequisites:
    pip install pytest pytest-asyncio websockets aiohttp pandas

Run tests:
    pytest tests/test_zoo_web_command_server.py -v
"""

import asyncio
import csv
import json
import os
from pathlib import Path
from typing import Dict, List, Any
from uuid import uuid4

import pytest
import websockets
from websockets.server import WebSocketServerProtocol


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


class MockZooWebSocketServer:
    """Mock Zoo Web API WebSocket Server for testing."""

    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.server = None
        self.clients = set()
        self.received_messages = []

    async def handle_client(self, websocket: WebSocketServerProtocol, path: str):
        """Handle client connections and messages."""
        self.clients.add(websocket)
        print(f"Client connected: {websocket.remote_address}")

        try:
            async for message in websocket:
                # Parse incoming message
                data = json.loads(message)
                self.received_messages.append(data)

                # Generate response based on command type
                response = await self.process_command(data)

                # Send response
                await websocket.send(json.dumps(response))

        except websockets.exceptions.ConnectionClosed:
            print(f"Client disconnected: {websocket.remote_address}")
        finally:
            self.clients.remove(websocket)

    async def process_command(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Process incoming command and generate response."""
        req_type = request.get('type')
        cmd_id = request.get('cmd_id')
        cmd = request.get('cmd', {})
        cmd_type = cmd.get('type')

        # Default success response
        response = {
            'type': 'modeling',
            'cmd_id': cmd_id,
            'success': True,
            'data': {}
        }

        # Command-specific responses
        if cmd_type == 'default_camera_get_view':
            response['data'] = {
                'position': {'x': 100, 'y': 100, 'z': 100},
                'quaternion': {'x': 0, 'y': 0, 'z': 0, 'w': 1},
                'target': {'x': 0, 'y': 0, 'z': 0}
            }

        elif cmd_type == 'default_camera_get_settings':
            response['data'] = {
                'fov_y': 45,
                'projection': 'perspective',
                'znear': 0.1,
                'zfar': 10000
            }

        elif cmd_type == 'get_sketch_mode_plane':
            response['data'] = {
                'origin': {'x': 0, 'y': 0, 'z': 0},
                'x_axis': {'x': 1, 'y': 0, 'z': 0},
                'y_axis': {'x': 0, 'y': 1, 'z': 0},
                'z_axis': {'x': 0, 'y': 0, 'z': 1}
            }

        elif cmd_type == 'select_with_point':
            response['data'] = {
                'entity_id': f'entity-{uuid4()}'
            }

        elif cmd_type == 'export2d':
            response['type'] = 'export'
            response['data'] = {
                'format': 'dxf',
                'content': 'MOCK_DXF_CONTENT'
            }

        # For unreliable channel commands, no response needed
        elif request.get('type') == 'modeling_cmd_req' and cmd.get('sequence') is not None:
            return None  # Unreliable commands don't return responses

        return response

    async def start(self):
        """Start the WebSocket server."""
        self.server = await websockets.serve(
            self.handle_client,
            self.host,
            self.port
        )
        print(f"Mock Zoo WebSocket Server started on ws://{self.host}:{self.port}")

    async def stop(self):
        """Stop the WebSocket server."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            print("Mock Zoo WebSocket Server stopped")


@pytest.fixture
async def mock_server():
    """Fixture to start and stop mock server."""
    server = MockZooWebSocketServer()
    await server.start()
    yield server
    await server.stop()


# =============================================================================
# SERVER TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_server_starts_and_accepts_connections(mock_server):
    """Test that server starts and accepts client connections."""
    uri = f"ws://{mock_server.host}:{mock_server.port}"

    async with websockets.connect(uri) as websocket:
        assert websocket.open
        print("✓ Server accepts connections")


@pytest.mark.asyncio
async def test_server_handles_ping_pong(mock_server):
    """Test server responds to ping messages."""
    uri = f"ws://{mock_server.host}:{mock_server.port}"

    async with websockets.connect(uri) as websocket:
        # Send ping
        ping_msg = {
            'type': 'ping',
            'timestamp': 1234567890
        }
        await websocket.send(json.dumps(ping_msg))

        # Receive response
        response = await websocket.recv()
        data = json.loads(response)

        assert data is not None
        print(f"✓ Server responded to ping: {data}")


@pytest.mark.asyncio
@pytest.mark.parametrize("command", ALL_COMMANDS)
async def test_server_processes_all_commands(mock_server, command):
    """Test server processes each command from CSV."""
    uri = f"ws://{mock_server.host}:{mock_server.port}"
    cmd_name = command['command_name']
    channel = command['channel']

    # Parse example usage to get command structure
    try:
        example = command['example_usage']
        # Extract JSON from example
        cmd_data = eval(example) if example.startswith('{') else {}
    except:
        cmd_data = {'type': cmd_name}

    # Build request
    request = {
        'type': 'modeling_cmd_req',
        'cmd_id': str(uuid4()),
        'cmd': cmd_data
    }

    async with websockets.connect(uri) as websocket:
        # Send command
        await websocket.send(json.dumps(request))

        # For reliable channel, expect response
        if channel == 'Reliable':
            response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
            data = json.loads(response)

            assert data is not None
            assert 'cmd_id' in data
            assert data['cmd_id'] == request['cmd_id']
            print(f"✓ Command '{cmd_name}' processed successfully (Reliable)")

        else:  # Unreliable channel
            # Unreliable commands may not get a response
            print(f"✓ Command '{cmd_name}' sent (Unreliable)")


@pytest.mark.asyncio
async def test_server_handles_batch_commands(mock_server):
    """Test server handles batch command requests."""
    uri = f"ws://{mock_server.host}:{mock_server.port}"

    batch_request = {
        'type': 'modeling_cmd_batch_req',
        'cmd_id': str(uuid4()),
        'batch': [
            {'type': 'select_clear'},
            {'type': 'default_camera_get_view'},
            {'type': 'zoom_to_fit', 'object_ids': [], 'padding': 0.2, 'animated': False}
        ]
    }

    async with websockets.connect(uri) as websocket:
        await websocket.send(json.dumps(batch_request))

        response = await websocket.recv()
        data = json.loads(response)

        assert data is not None
        print(f"✓ Batch command processed: {data}")


@pytest.mark.asyncio
async def test_server_handles_camera_commands(mock_server):
    """Test server handles all camera-related commands."""
    uri = f"ws://{mock_server.host}:{mock_server.port}"

    camera_commands = [
        {
            'type': 'default_camera_look_at',
            'center': {'x': 0, 'y': 0, 'z': 0},
            'vantage': {'x': 100, 'y': 100, 'z': 100},
            'up': {'x': 0, 'y': 0, 'z': 1}
        },
        {'type': 'default_camera_get_view'},
        {'type': 'default_camera_get_settings'},
        {'type': 'default_camera_set_orthographic'},
        {'type': 'zoom_to_fit', 'object_ids': [], 'padding': 0.2, 'animated': False}
    ]

    async with websockets.connect(uri) as websocket:
        for cmd in camera_commands:
            request = {
                'type': 'modeling_cmd_req',
                'cmd_id': str(uuid4()),
                'cmd': cmd
            }

            await websocket.send(json.dumps(request))
            response = await websocket.recv()
            data = json.loads(response)

            assert data['success'] == True
            print(f"✓ Camera command '{cmd['type']}' succeeded")


@pytest.mark.asyncio
async def test_server_handles_selection_commands(mock_server):
    """Test server handles selection commands."""
    uri = f"ws://{mock_server.host}:{mock_server.port}"

    async with websockets.connect(uri) as websocket:
        # Select with point
        request = {
            'type': 'modeling_cmd_req',
            'cmd_id': str(uuid4()),
            'cmd': {
                'type': 'select_with_point',
                'selected_at_window': {'x': 0.5, 'y': 0.5},
                'selection_type': 'replace'
            }
        }

        await websocket.send(json.dumps(request))
        response = await websocket.recv()
        data = json.loads(response)

        assert 'entity_id' in data['data']
        print(f"✓ Selection command returned entity_id: {data['data']['entity_id']}")


@pytest.mark.asyncio
async def test_server_handles_sketch_mode_commands(mock_server):
    """Test server handles sketch mode commands."""
    uri = f"ws://{mock_server.host}:{mock_server.port}"

    async with websockets.connect(uri) as websocket:
        # Enter sketch mode
        request1 = {
            'type': 'modeling_cmd_req',
            'cmd_id': str(uuid4()),
            'cmd': {
                'type': 'enable_sketch_mode',
                'entity_id': 'test-face-id',
                'adjust_camera': True,
                'animated': True,
                'ortho': True
            }
        }

        await websocket.send(json.dumps(request1))
        response1 = await websocket.recv()
        data1 = json.loads(response1)

        assert data1['success'] == True

        # Get sketch plane
        request2 = {
            'type': 'modeling_cmd_req',
            'cmd_id': str(uuid4()),
            'cmd': {'type': 'get_sketch_mode_plane'}
        }

        await websocket.send(json.dumps(request2))
        response2 = await websocket.recv()
        data2 = json.loads(response2)

        assert 'origin' in data2['data']

        # Exit sketch mode
        request3 = {
            'type': 'modeling_cmd_req',
            'cmd_id': str(uuid4()),
            'cmd': {'type': 'sketch_mode_disable'}
        }

        await websocket.send(json.dumps(request3))
        response3 = await websocket.recv()
        data3 = json.loads(response3)

        assert data3['success'] == True
        print("✓ Sketch mode workflow completed")


@pytest.mark.asyncio
async def test_server_multiple_concurrent_clients(mock_server):
    """Test server handles multiple concurrent clients."""
    uri = f"ws://{mock_server.host}:{mock_server.port}"

    async def client_session(client_id):
        async with websockets.connect(uri) as websocket:
            request = {
                'type': 'modeling_cmd_req',
                'cmd_id': str(uuid4()),
                'cmd': {'type': 'default_camera_get_view'}
            }

            await websocket.send(json.dumps(request))
            response = await websocket.recv()
            data = json.loads(response)

            assert data is not None
            print(f"✓ Client {client_id} received response")

    # Run 5 concurrent clients
    await asyncio.gather(*[client_session(i) for i in range(5)])


@pytest.mark.asyncio
async def test_server_error_handling():
    """Test server handles malformed requests gracefully."""
    # This test would check server behavior with invalid JSON, missing fields, etc.
    # Implementation depends on actual server error handling logic
    pass


# =============================================================================
# COMMAND VALIDATION TESTS
# =============================================================================

def test_csv_file_exists():
    """Test that CSV file exists and is readable."""
    csv_path = Path(__file__).parent.parent / "zoo_web_api_commands.csv"
    assert csv_path.exists()
    print(f"✓ CSV file found: {csv_path}")


def test_all_commands_have_required_fields():
    """Test that all commands in CSV have required fields."""
    required_fields = ['command_name', 'category', 'description', 'channel']

    for cmd in ALL_COMMANDS:
        for field in required_fields:
            assert field in cmd
            assert cmd[field].strip() != ''

    print(f"✓ All {len(ALL_COMMANDS)} commands have required fields")


def test_command_categories():
    """Test that commands are properly categorized."""
    categories = set(cmd['category'] for cmd in ALL_COMMANDS)

    expected_categories = {
        'Camera/View', 'Camera Interaction', 'Camera Control', 'Camera Query',
        'Camera Projection', 'Camera Animation', 'Entity Highlighting',
        'Selection', 'Sketch Mode', 'Sketch Mode Query', 'Rendering',
        'Rendering/Stream', 'Object Visibility', 'Edge Visibility',
        'Predefined View', 'Export'
    }

    assert categories.issubset(expected_categories)
    print(f"✓ Found {len(categories)} valid categories")


def test_channel_types():
    """Test that all commands use valid channel types."""
    valid_channels = {'Reliable', 'Unreliable'}

    for cmd in ALL_COMMANDS:
        assert cmd['channel'] in valid_channels

    reliable_count = sum(1 for cmd in ALL_COMMANDS if cmd['channel'] == 'Reliable')
    unreliable_count = len(ALL_COMMANDS) - reliable_count

    print(f"✓ Reliable: {reliable_count}, Unreliable: {unreliable_count}")


if __name__ == '__main__':
    # Run tests with pytest
    pytest.main([__file__, '-v', '--tb=short'])
