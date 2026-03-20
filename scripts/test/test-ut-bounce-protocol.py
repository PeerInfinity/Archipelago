#!/usr/bin/env python3
"""
Manual Test Script for UT Bounce Protocol

This script tests the UT_TEST_SYNC bounce protocol by:
1. Connecting to an Archipelago server as a test driver
2. Sending STEP bounce messages to Universal Tracker
3. Waiting for READY bounce responses
4. Verifying the protocol works correctly

Usage:
    1. Start an Archipelago server with a game
    2. Start Universal Tracker connected to the server with --sphere-log-mode
    3. Run this script connected to the same server

    python scripts/test/test-ut-bounce-protocol.py --connect localhost:38281 --name "Player1"

Prerequisites:
    - Archipelago server running
    - Universal Tracker connected with sphere log mode enabled:
      python -m worlds.tracker.TrackerClient --connect localhost:38281 --name "Player1" \
          --sphere-log-mode --sphere-log-output /tmp/sphere_log_ut.jsonl
"""

import asyncio
import argparse
import logging
import sys
import os

# Add the project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from CommonClient import CommonContext, server_loop, get_base_parser

logger = logging.getLogger("TestDriver")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


class TestDriverContext(CommonContext):
    """Minimal client for testing the UT_TEST_SYNC bounce protocol."""

    game = ""  # No specific game - we connect as a "watcher" style client
    tags = {"AP", "TextOnly"}  # Basic AP client tags
    items_handling = 0  # Don't request any items (required for empty game connect)

    def __init__(self, server_address, password):
        super().__init__(server_address, password)
        self.ready_events = {}  # sphere -> asyncio.Event
        self.test_complete = asyncio.Event()

    async def server_auth(self, password_requested: bool = False):
        """Authenticate with the server."""
        if password_requested and not self.password:
            logger.error("Server requires password but none provided")
            return

        # Connect with empty game to act as a "watcher" that can send bounces
        # items_handling=0 is required when game is empty
        await self.send_connect(game="")

    def on_package(self, cmd: str, args: dict):
        """Handle incoming packages, specifically Bounced messages."""
        if cmd == "Bounced":
            data = args.get("data", {})
            if data.get("type") == "UT_TEST_SYNC":
                action = data.get("action")
                sphere = data.get("sphere")

                if action == "READY":
                    logger.info(f"[TestDriver] Received READY for sphere {sphere}")
                    if sphere in self.ready_events:
                        self.ready_events[sphere].set()

    async def send_step_bounce(self, sphere: str):
        """Send a STEP bounce message and wait for READY response."""
        # Create event for this sphere
        self.ready_events[sphere] = asyncio.Event()

        # Send STEP bounce - target clients with "Tracker" tag (UT)
        logger.info(f"[TestDriver] Sending STEP for sphere {sphere}")
        await self.send_msgs([{
            "cmd": "Bounce",
            "tags": ["Tracker"],  # Target Universal Tracker clients
            "data": {
                "type": "UT_TEST_SYNC",
                "action": "STEP",
                "sphere": sphere
            }
        }])

        # Wait for READY response with timeout
        try:
            await asyncio.wait_for(self.ready_events[sphere].wait(), timeout=30.0)
            logger.info(f"[TestDriver] ✓ Received READY for sphere {sphere}")
            return True
        except asyncio.TimeoutError:
            logger.error(f"[TestDriver] ✗ Timeout waiting for READY for sphere {sphere}")
            return False

    async def send_complete_bounce(self):
        """Send a COMPLETE bounce message to signal end of test."""
        logger.info("[TestDriver] Sending COMPLETE signal")
        await self.send_msgs([{
            "cmd": "Bounce",
            "tags": ["Tracker"],  # Target Universal Tracker clients
            "data": {
                "type": "UT_TEST_SYNC",
                "action": "COMPLETE"
            }
        }])


async def run_test(ctx: TestDriverContext, test_spheres: list[str]):
    """Run the bounce protocol test."""
    logger.info("=" * 60)
    logger.info("Starting UT Bounce Protocol Test")
    logger.info("=" * 60)

    # Wait for connection - we connect with game="" so we won't get a slot
    # Just wait for the server to be connected
    logger.info("Waiting for connection to server...")
    wait_count = 0
    while not ctx.server or not ctx.server.socket or ctx.server.socket.closed:
        await asyncio.sleep(0.5)
        wait_count += 1
        if wait_count > 20:  # 10 second timeout
            logger.error("Connection failed - timeout")
            return False
        if ctx.exit_event.is_set():
            logger.error("Connection failed - exit event set")
            return False

    logger.info("Connected to server (as watcher/text client)")

    # Give UT time to also connect
    logger.info("Waiting 3 seconds for Universal Tracker to connect...")
    await asyncio.sleep(3)

    # Run test for each sphere
    all_passed = True
    for sphere in test_spheres:
        success = await ctx.send_step_bounce(sphere)
        if not success:
            all_passed = False
            break
        # Small delay between spheres
        await asyncio.sleep(0.5)

    # Send complete signal
    await ctx.send_complete_bounce()

    # Report results
    logger.info("=" * 60)
    if all_passed:
        logger.info("✓ TEST PASSED: All STEP/READY exchanges completed successfully")
    else:
        logger.error("✗ TEST FAILED: Some STEP/READY exchanges failed")
    logger.info("=" * 60)

    return all_passed


async def main(args):
    """Main entry point."""
    ctx = TestDriverContext(args.connect, args.password)
    ctx.auth = args.name

    # Start server connection
    ctx.server_task = asyncio.create_task(server_loop(ctx), name="server loop")

    # Define test spheres
    test_spheres = ["0", "0.1", "0.2", "1.1", "1.2", "2.1"]

    # Run the test
    try:
        success = await run_test(ctx, test_spheres)
    except Exception as e:
        logger.exception(f"Test failed with exception: {e}")
        success = False
    finally:
        # Disconnect and cleanup
        await ctx.disconnect()
        ctx.exit_event.set()

    return 0 if success else 1


def launch():
    """Parse arguments and run."""
    parser = get_base_parser(description="Test driver for UT_TEST_SYNC bounce protocol")
    parser.add_argument('--name', default=None, required=True, help="Slot name to connect as")
    parser.add_argument("url", nargs="?", help="Archipelago connection url")

    args = parser.parse_args()

    # Handle URL argument
    if args.url:
        if not args.connect:
            args.connect = args.url

    if not args.connect:
        logger.error("Must provide server address via --connect or url argument")
        return 1

    return asyncio.run(main(args))


if __name__ == "__main__":
    sys.exit(launch())
