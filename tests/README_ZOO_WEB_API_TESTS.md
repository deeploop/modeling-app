# Zoo Web API Command Tests

This directory contains comprehensive tests for the Zoo Web API commands used in Zoo Design Studio.

## 📋 Files Overview

### 1. **zoo_web_api_commands.csv**
Complete reference list of all 28 Zoo Web API commands with:
- Command name
- Category
- Description
- Channel type (Reliable/Unreliable)
- Parameters
- Return type
- Example usage
- File location in source code

### 2. **test_zoo_web_command_server.py**
Tests for WebSocket **server** functionality:
- Server startup and connection handling
- Command processing for all 28 commands
- Batch command support
- Multiple concurrent client support
- Camera, selection, and sketch mode workflows
- Command validation from CSV

### 3. **test_zoo_web_command_client.py**
Tests for WebSocket **client** functionality:
- Client connection/disconnection
- Sending all 28 commands from CSV
- Batch command sending
- Reliable vs Unreliable channel handling
- Event subscriptions
- Concurrent command execution
- Error handling and timeouts

## 🚀 Quick Start

### Prerequisites

Install required Python packages:

```bash
pip install pytest pytest-asyncio websockets aiohttp pandas
```

### Running Tests

#### Run All Tests
```bash
# From project root
pytest tests/ -v

# Or specifically
pytest tests/test_zoo_web_command_server.py -v
pytest tests/test_zoo_web_command_client.py -v
```

#### Run Specific Test Categories
```bash
# Server tests only
pytest tests/test_zoo_web_command_server.py -v

# Client tests only
pytest tests/test_zoo_web_command_client.py -v

# Run tests for specific command category
pytest tests/test_zoo_web_command_server.py::test_server_handles_camera_commands -v
pytest tests/test_zoo_web_command_client.py::test_client_camera_drag_workflow -v
```

#### Run with Coverage
```bash
pip install pytest-cov

pytest tests/ --cov=. --cov-report=html
```

## 📊 Command Statistics

From `zoo_web_api_commands.csv`:

| Category | Count | Channel |
|----------|-------|---------|
| Camera Control | 12 | Reliable & Unreliable |
| Selection | 4 | Reliable & Unreliable |
| Sketch Mode | 3 | Reliable |
| Rendering | 4 | Reliable |
| Export | 1 | Reliable |
| **Total** | **28** | |

**Channel Distribution:**
- Reliable (WebSocket): 23 commands
- Unreliable (DataChannel): 5 commands

## 🧪 Test Coverage

### Server Tests (`test_zoo_web_command_server.py`)

✅ **Connection Tests**
- Server startup and client acceptance
- Ping/pong keep-alive
- Multiple concurrent clients

✅ **Command Processing Tests**
- All 28 commands from CSV (parametrized)
- Batch command handling
- Reliable vs Unreliable routing

✅ **Workflow Tests**
- Camera control workflows
- Selection workflows
- Sketch mode workflows

✅ **Validation Tests**
- CSV file structure
- Command field validation
- Channel type validation
- Category validation

### Client Tests (`test_zoo_web_command_client.py`)

✅ **Connection Tests**
- Client connect/disconnect
- Connection error handling
- Graceful disconnection

✅ **Command Sending Tests**
- All 28 commands from CSV (parametrized)
- Commands with parameters
- Unreliable channel commands
- Batch commands

✅ **Workflow Tests**
- Camera drag workflow (start → move → end)
- Selection workflow (clear → select → add)
- Sketch mode workflow (enter → query → exit)

✅ **Advanced Features**
- Event subscriptions
- Concurrent command execution
- Rapid unreliable command sending
- Timeout handling

✅ **Performance Tests**
- Concurrent commands (3+ simultaneous)
- Rapid unreliable commands (50+ in sequence)

## 📖 Example Usage

### Using the CSV as Reference

```python
import csv

# Load command definitions
with open('zoo_web_api_commands.csv', 'r') as f:
    commands = list(csv.DictReader(f))

# Find camera commands
camera_cmds = [c for c in commands if 'Camera' in c['category']]
print(f"Found {len(camera_cmds)} camera commands")

# Get unreliable commands
unreliable = [c for c in commands if c['channel'] == 'Unreliable']
print(f"Unreliable commands: {[c['command_name'] for c in unreliable]}")
```

### Running Server Tests

```python
# Run tests programmatically
import pytest

# Run all server tests
pytest.main(['tests/test_zoo_web_command_server.py', '-v'])

# Run specific test
pytest.main([
    'tests/test_zoo_web_command_server.py::test_server_handles_camera_commands',
    '-v'
])
```

### Using the Client in Your Code

```python
from tests.test_zoo_web_command_client import ZooWebSocketClient

async def example():
    # Create client
    client = ZooWebSocketClient(uri="ws://localhost:8765")
    await client.connect()

    # Send camera command
    response = await client.send_command('default_camera_get_view')
    print(f"Camera view: {response.data}")

    # Send selection command
    response = await client.send_command('select_with_point', {
        'selected_at_window': {'x': 0.5, 'y': 0.5},
        'selection_type': 'replace'
    })
    print(f"Selected entity: {response.data.get('entity_id')}")

    # Disconnect
    await client.disconnect()
```

## 🔧 Configuration

### Mock Server Configuration

The mock server in `test_zoo_web_command_server.py` can be configured:

```python
# Change port
server = MockZooWebSocketServer(host='localhost', port=9999)

# Access received messages
print(f"Server received {len(server.received_messages)} messages")
```

### Client Configuration

```python
# Custom URI
client = ZooWebSocketClient(uri="ws://custom-host:8765")

# Custom timeout
response = await client.send_command('some_command', timeout=10.0)

# Subscribe to events
def on_camera_update(data):
    print(f"Camera updated: {data}")

client.subscribe('default_camera_get_settings', on_camera_update)
```

## 📝 Command Reference

### Camera Commands

```python
# Look at target
await client.send_command('default_camera_look_at', {
    'center': {'x': 0, 'y': 0, 'z': 0},
    'vantage': {'x': 100, 'y': 100, 'z': 100},
    'up': {'x': 0, 'y': 0, 'z': 1}
})

# Get current view
response = await client.send_command('default_camera_get_view')

# Zoom
await client.send_command('default_camera_zoom',
    {'magnitude': -5},
    reliable=False  # Unreliable channel
)

# Zoom to fit
await client.send_command('zoom_to_fit', {
    'object_ids': [],
    'padding': 0.2,
    'animated': True
})
```

### Selection Commands

```python
# Clear selection
await client.send_command('select_clear')

# Select at point
response = await client.send_command('select_with_point', {
    'selected_at_window': {'x': 0.5, 'y': 0.5},
    'selection_type': 'add'
})

# Highlight entity (unreliable)
await client.send_command('highlight_set_entity',
    {'selected_at_window': {'x': 0.5, 'y': 0.3}},
    reliable=False
)
```

### Sketch Mode Commands

```python
# Enter sketch mode
await client.send_command('enable_sketch_mode', {
    'entity_id': 'face-id-123',
    'adjust_camera': True,
    'animated': True,
    'ortho': True
})

# Get sketch plane info
response = await client.send_command('get_sketch_mode_plane')
print(f"Sketch plane: {response.data}")

# Exit sketch mode
await client.send_command('sketch_mode_disable')
```

### Batch Commands

```python
# Send multiple commands at once
response = await client.send_batch_commands([
    {'type': 'select_clear'},
    {'type': 'default_camera_get_view'},
    {'type': 'zoom_to_fit', 'object_ids': [], 'padding': 0.2, 'animated': False}
])
```

## 🐛 Debugging

### Enable Verbose Output

```bash
# Run with verbose output
pytest tests/ -v -s

# Show print statements
pytest tests/ --capture=no

# Show full traceback
pytest tests/ --tb=long
```

### Debug Specific Test

```python
# Add breakpoints in test
import pdb; pdb.set_trace()

# Or use pytest's debugger
pytest tests/test_zoo_web_command_client.py::test_client_sends_simple_command --pdb
```

## 📈 Performance Benchmarks

Expected performance (on local mock server):

- **Single command latency**: < 10ms
- **Batch command (3 commands)**: < 50ms
- **Concurrent commands (5 simultaneous)**: < 100ms
- **Unreliable command throughput**: 100+ commands/second

## 🤝 Contributing

When adding new commands:

1. Add to `zoo_web_api_commands.csv`
2. Update server mock responses in `test_zoo_web_command_server.py`
3. Add test cases for the new command
4. Run all tests to ensure compatibility

## 📚 Additional Resources

- **Zoo Web API Documentation**: https://zoo.dev/docs/api
- **WebSocket Protocol**: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
- **Pytest Documentation**: https://docs.pytest.org/
- **Pytest-asyncio**: https://pytest-asyncio.readthedocs.io/

## 🔍 Troubleshooting

### Tests Failing

```bash
# Clean pytest cache
pytest --cache-clear

# Reinstall dependencies
pip install --upgrade pytest pytest-asyncio websockets

# Check Python version (requires 3.7+)
python --version
```

### Port Already in Use

```python
# Change server port in tests
server = MockZooWebSocketServer(port=8767)  # Use different port
```

### Timeout Issues

```python
# Increase timeout for slow systems
response = await client.send_command('command', timeout=30.0)
```

## 📄 License

These tests are part of the Zoo Design Studio project.

---

**Last Updated**: 2026-01-23
**Test Coverage**: 28 commands, 40+ test cases
**Maintained by**: Zoo Design Studio Team
