#!/usr/bin/env python3
"""
Setup and manage Archipelago server for testing.
This script provides the same cleanup and setup functionality as the Playwright tests.
"""

import argparse
import os
import subprocess
import sys
import time
import signal
from pathlib import Path


def get_seed_id(seed):
    """
    Compute seed ID from seed number (matches Archipelago's logic).
    This is a simplified version - matches the JavaScript implementation.
    """
    seed_str = str(seed)
    seeddigits = 20

    # Predefined seed IDs for common seeds
    seed_ids = {
        '1': 'AP_14089154938208861744',
        '2': 'AP_01043188731678011336',
        '3': 'AP_84719271504320872445',
        '4': 'AP_04075275976995164868',
        '5': 'AP_98560778217298494071'
    }

    return seed_ids.get(seed_str, f"AP_{seed_str.zfill(seeddigits)}")


def stop_server(port):
    """
    Stop any running Archipelago server on the specified port.
    """
    print(f"Stopping any existing server on port {port}...")
    try:
        # Find processes using the port and kill them
        result = subprocess.run(
            f"lsof -ti:{port} | xargs kill -9 2>/dev/null || true",
            shell=True,
            capture_output=True,
            text=True
        )
        print("Stopped any existing server")
    except Exception as e:
        # Ignore errors - server might not be running
        pass


def cleanup_save_file(game, seed_id, project_root):
    """
    Delete .apsave file to ensure clean state.
    """
    game_dir = Path(project_root) / "frontend" / "presets" / game / seed_id
    apsave_path = game_dir / f"{seed_id}.apsave"

    if apsave_path.exists():
        os.unlink(apsave_path)
        print(f"Deleted {apsave_path}")
    else:
        print(f"No .apsave file found at {apsave_path}")


def start_server(game, seed, port, project_root, log_file='server_log.txt'):
    """
    Start Archipelago server with the specified game and seed.
    Returns the subprocess object for the server process.
    """
    seed_id = get_seed_id(seed)
    game_dir = Path(project_root) / "frontend" / "presets" / game / seed_id
    archipelago_file = game_dir / f"{seed_id}.archipelago"

    # Check if file exists
    if not archipelago_file.exists():
        raise FileNotFoundError(f"Archipelago file not found: {archipelago_file}")

    print(f"Starting server with: {archipelago_file}")

    # Start the server (run from project root)
    server_proc = subprocess.Popen(
        [
            'python3',
            'MultiServer.py',
            '--host', 'localhost',
            '--port', str(port),
            str(archipelago_file)
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        cwd=project_root
    )

    # Redirect output to log file (relative to project root)
    log_path = Path(project_root) / log_file
    with open(log_path, 'w') as log:
        # Write initial message
        log.write(f"Server started for {game} seed {seed} (ID: {seed_id})\n")
        log.write(f"Port: {port}\n")
        log.write(f"Archipelago file: {archipelago_file}\n")
        log.write("=" * 60 + "\n")
        log.flush()

    # Give server time to start
    time.sleep(3)

    # Check if server is still running
    if server_proc.poll() is not None:
        # Server has exited, get the error output
        stdout, stderr = server_proc.communicate()
        raise RuntimeError(f"Server failed to start. Exit code: {server_proc.returncode}\nStdout: {stdout}\nStderr: {stderr}")

    print(f"Server started on port {port}")
    print(f"Server output being logged to: {log_file}")

    return server_proc


def monitor_server(server_proc, project_root, log_file='server_log.txt'):
    """
    Monitor the server process and log output continuously.
    This runs until interrupted or the server exits.
    """
    log_path = Path(project_root) / log_file

    print("\nServer is running. Press Ctrl+C to stop.")
    print(f"Monitoring server output (also logged to {log_file})...")
    print("=" * 60)

    try:
        with open(log_path, 'a') as log:
            while server_proc.poll() is None:
                # Read stdout
                if server_proc.stdout:
                    line = server_proc.stdout.readline()
                    if line:
                        print(f"[STDOUT] {line}", end='')
                        log.write(line)
                        log.flush()

                # Read stderr
                if server_proc.stderr:
                    line = server_proc.stderr.readline()
                    if line:
                        print(f"[STDERR] {line}", end='', file=sys.stderr)
                        log.write(f"[STDERR] {line}")
                        log.flush()

                time.sleep(0.1)
    except KeyboardInterrupt:
        print("\nInterrupted by user")

    # Check final status
    if server_proc.poll() is not None:
        print(f"\nServer has exited with code: {server_proc.returncode}")


def main():
    parser = argparse.ArgumentParser(
        description='Setup and manage Archipelago server for testing',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Start server with default settings (adventure, seed 1, port 38281)
  %(prog)s

  # Start server for a specific game and seed
  %(prog)s --game adventure --seed 2

  # Only stop the server and clean up
  %(prog)s --stop-only

  # Only perform cleanup without starting
  %(prog)s --cleanup-only --game adventure --seed 1

  # Start server on a different port
  %(prog)s --port 38282

  # Start server and run in background (no monitoring)
  %(prog)s --no-monitor
        """
    )

    parser.add_argument(
        '--game',
        default='adventure',
        help='Game type (default: adventure)'
    )

    parser.add_argument(
        '--seed',
        default='1',
        help='Seed number (default: 1)'
    )

    parser.add_argument(
        '--port',
        type=int,
        default=38281,
        help='Server port (default: 38281)'
    )

    parser.add_argument(
        '--log-file',
        default='server_log.txt',
        help='Server log file path (default: server_log.txt)'
    )

    parser.add_argument(
        '--stop-only',
        action='store_true',
        help='Only stop the server, do not start a new one'
    )

    parser.add_argument(
        '--cleanup-only',
        action='store_true',
        help='Only perform cleanup (stop server and delete .apsave), do not start server'
    )

    parser.add_argument(
        '--no-monitor',
        action='store_true',
        help='Start server but do not monitor output (returns immediately)'
    )

    args = parser.parse_args()

    # Determine project root (one level up from scripts directory)
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent

    # Always stop existing server first
    stop_server(args.port)

    if args.stop_only:
        print("Stop-only mode: Server stopped, exiting.")
        return 0

    # Compute seed ID for cleanup
    seed_id = get_seed_id(args.seed)

    # Clean up save file
    cleanup_save_file(args.game, seed_id, project_root)

    if args.cleanup_only:
        print("Cleanup-only mode: Cleanup completed, exiting.")
        return 0

    # Start the server
    try:
        server_proc = start_server(args.game, args.seed, args.port, project_root, args.log_file)
    except Exception as e:
        print(f"Error starting server: {e}", file=sys.stderr)
        return 1

    if args.no_monitor:
        print(f"\nServer is running in background (PID: {server_proc.pid})")
        print(f"To stop: kill {server_proc.pid}")
        return 0

    # Monitor the server
    try:
        monitor_server(server_proc, project_root, args.log_file)
    finally:
        # Clean shutdown
        if server_proc.poll() is None:
            print("\nStopping server...")
            server_proc.terminate()
            try:
                server_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print("Server did not stop gracefully, killing...")
                server_proc.kill()
                server_proc.wait()
        print("Server stopped.")

    return 0


if __name__ == '__main__':
    sys.exit(main())
