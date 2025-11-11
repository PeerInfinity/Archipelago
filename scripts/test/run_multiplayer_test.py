#!/usr/bin/env python3
"""
Automated Multiplayer Test Orchestration Script

This script orchestrates a full integration test with two simultaneous clients:
1. Generates a multiworld using Generate.py
2. Cleans any existing server state files
3. Starts an Archipelago server
4. Runs two frontend clients simultaneously via Playwright
5. Collects results from both clients
6. Stops the server and cleans up

Usage:
    python3 scripts/test/run_multiplayer_test.py --game alttp --seed 14089154938208861744
    python3 scripts/test/run_multiplayer_test.py --player-file path/to/player.yaml
"""

import subprocess
import time
import os
import sys
import argparse
import signal


def run_multiplayer_integration_test(game, seed, player_file, output_dir="test_results/multiplayer", server_port=38281):
    """
    Run full integration test with dual clients connecting to the same Archipelago server.

    Args:
        game: Game name (e.g., 'alttp', 'sm')
        seed: Seed value for generation
        player_file: Path to player files directory
        output_dir: Directory to save test results
        server_port: Port for Archipelago server

    Returns:
        bool: True if test passed, False otherwise
    """
    server_proc = None

    try:
        # Step 1: Generate multiworld
        print(f"\n{'='*60}")
        print("STEP 1: Generating multiworld")
        print(f"{'='*60}")
        print(f"Game: {game}")
        print(f"Seed: {seed}")
        print(f"Player files: {player_file}")

        gen_result = subprocess.run([
            "python3", "Generate.py",
            "--player_files_path", player_file,
            "--seed", str(seed),
        ], check=True)

        print("✓ Multiworld generation completed")

        # Step 2: Clean server state files
        print(f"\n{'='*60}")
        print("STEP 2: Cleaning server state files")
        print(f"{'='*60}")

        preset_dir = f"frontend/presets/{game}/AP_{seed}"
        if not os.path.exists(preset_dir):
            print(f"Warning: Preset directory not found at {preset_dir}")
            print("Trying alternative location...")
            preset_dir = f"frontend/presets/{game}/{seed}"
            if not os.path.exists(preset_dir):
                raise FileNotFoundError(f"Could not find preset directory for {game}/{seed}")

        cleanup_cmd = f"rm -f {preset_dir}/*.apsave"
        subprocess.run(cleanup_cmd, shell=True)
        print(f"✓ Cleaned: {preset_dir}/*.apsave")

        # Step 3: Start Archipelago server
        print(f"\n{'='*60}")
        print("STEP 3: Starting Archipelago server")
        print(f"{'='*60}")

        # Find the .archipelago file
        archipelago_file = None
        for filename in os.listdir(preset_dir):
            if filename.endswith('.archipelago'):
                archipelago_file = os.path.join(preset_dir, filename)
                break

        if not archipelago_file:
            raise FileNotFoundError(f"No .archipelago file found in {preset_dir}")

        print(f"Using: {archipelago_file}")
        print(f"Port: {server_port}")

        server_proc = subprocess.Popen(
            [
                "python3", "MultiServer.py",
                "--host", "localhost",
                "--port", str(server_port),
                archipelago_file
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Wait for server startup
        print("Waiting for server to start...")
        time.sleep(5)

        # Check if server is still running
        if server_proc.poll() is not None:
            stdout, stderr = server_proc.communicate()
            print("✗ Server failed to start!")
            print("STDOUT:", stdout)
            print("STDERR:", stderr)
            return False

        print(f"✓ Server started successfully on port {server_port}")

        # Step 4: Run multiplayer Playwright tests
        print(f"\n{'='*60}")
        print("STEP 4: Running dual-client Playwright tests")
        print(f"{'='*60}")
        print("Client 1: Test mode")
        print("Client 2: Spoilers mode")

        env = os.environ.copy()
        env.update({
            "TEST_GAME": game,
            "TEST_SEED": str(seed),
            "TEST_OUTPUT_DIR": output_dir
        })

        test_result = subprocess.run(
            ["npm", "run", "test:multiplayer"],
            env=env
        )

        success = test_result.returncode == 0

        print(f"\n{'='*60}")
        if success:
            print("✓ TEST RESULT: PASSED")
        else:
            print("✗ TEST RESULT: FAILED")
        print(f"{'='*60}")

        return success

    except FileNotFoundError as e:
        print(f"\n✗ ERROR: {e}", file=sys.stderr)
        print("Make sure the preset directory structure is correct.", file=sys.stderr)
        return False

    except subprocess.CalledProcessError as e:
        print(f"\n✗ ERROR: Command failed with exit code {e.returncode}", file=sys.stderr)
        print(f"Command: {e.cmd}", file=sys.stderr)
        return False

    except Exception as e:
        print(f"\n✗ ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False

    finally:
        # Step 5: Cleanup - Stop server
        if server_proc:
            print(f"\n{'='*60}")
            print("STEP 5: Stopping Archipelago server")
            print(f"{'='*60}")

            server_proc.terminate()
            try:
                server_proc.wait(timeout=5)
                print("✓ Server stopped successfully")
            except subprocess.TimeoutExpired:
                print("Server didn't stop gracefully, killing...")
                server_proc.kill()
                server_proc.wait()
                print("✓ Server killed")


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Run automated multiplayer integration test",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 scripts/test/run_multiplayer_test.py --game alttp --seed 14089154938208861744
  python3 scripts/test/run_multiplayer_test.py --game sm --seed 12345 --player-file custom/players
  python3 scripts/test/run_multiplayer_test.py --output-dir custom_results
        """
    )

    parser.add_argument(
        "--game",
        default="alttp",
        help="Game name (default: alttp)"
    )
    parser.add_argument(
        "--seed",
        default="14089154938208861744",
        help="Seed value (default: 14089154938208861744)"
    )
    parser.add_argument(
        "--player-file",
        dest="player_file",
        default="player_files",
        help="Path to player files directory (default: player_files)"
    )
    parser.add_argument(
        "--output-dir",
        dest="output_dir",
        default="test_results/multiplayer",
        help="Output directory for test results (default: test_results/multiplayer)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=38281,
        help="Archipelago server port (default: 38281)"
    )

    args = parser.parse_args()

    print("="*60)
    print("MULTIPLAYER INTEGRATION TEST")
    print("="*60)
    print(f"Configuration:")
    print(f"  Game:         {args.game}")
    print(f"  Seed:         {args.seed}")
    print(f"  Player files: {args.player_file}")
    print(f"  Output dir:   {args.output_dir}")
    print(f"  Server port:  {args.port}")
    print("="*60)

    success = run_multiplayer_integration_test(
        args.game,
        args.seed,
        args.player_file,
        args.output_dir,
        args.port
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
