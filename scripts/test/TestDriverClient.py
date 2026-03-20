#!/usr/bin/env python3
"""
Test Driver Client for UT Comparison Testing

This client drives the UT comparison test by:
1. Reading the Python-generated sphere_log.jsonl to get the sequence of location checks
2. Connecting to an Archipelago server as the actual player
3. For each sphere step:
   a. Sending STEP bounce message to Universal Tracker
   b. Waiting for READY bounce response from UT
   c. Checking the locations listed in sphere_locations for that step
4. Sending COMPLETE when all locations are checked

Usage:
    python scripts/test/TestDriverClient.py \
        --connect localhost:38281 \
        --name "Player1" \
        --sphere-log /path/to/sphere_log.jsonl

Prerequisites:
    - Archipelago server running with the generated game
    - Universal Tracker connected with --sphere-log-mode enabled
"""

import asyncio
import argparse
import json
import logging
import sys
import os
from pathlib import Path

# Add the project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from CommonClient import CommonContext, server_loop, get_base_parser

logger = logging.getLogger("TestDriver")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


class TestDriverContext(CommonContext):
    """
    Client that drives the UT comparison test by checking locations in sphere order.

    Unlike the bounce protocol test script which connects as a watcher,
    this client connects as the actual player and performs location checks.
    """

    # Set game at class level - Adventure for now, could be parameterized
    game = "Adventure"
    tags = {"AP"}  # Normal player client - UT targets AP for READY bounces
    items_handling = 0b111  # Request all items

    def __init__(self, server_address: str, password: str | None, sphere_log_path: str, player_id: int = 1, game_name: str = "Adventure"):
        super().__init__(server_address, password)
        self.sphere_log_path = sphere_log_path
        self.player_id = player_id
        self.ready_events: dict[str, asyncio.Event] = {}
        self.sphere_entries: list[dict] = []
        self.location_name_to_id: dict[str, int] = {}
        TestDriverContext.game = game_name  # Set the game name

    async def server_auth(self, password_requested: bool = False):
        """Authenticate with the server."""
        if password_requested and not self.password:
            logger.error("Server requires password but none provided")
            return
        # Connect with the specified game
        await self.send_connect()

    def on_package(self, cmd: str, args: dict):
        """Handle incoming packages, specifically Bounced messages."""
        if cmd == "Connected":
            # Store location mappings
            self.game = args.get("slot_info", {}).get(str(args.get("slot", 1)), ["", ""])[1]
            logger.info(f"Connected to game: {self.game}")

            # Build location name to ID mapping from missing_locations
            # We need to use the datapackage for this

        elif cmd == "Bounced":
            data = args.get("data", {})
            if data.get("type") == "UT_TEST_SYNC":
                action = data.get("action")
                sphere = data.get("sphere")

                if action == "READY":
                    logger.debug(f"[TestDriver] Received READY for sphere {sphere}")
                    if sphere in self.ready_events:
                        logger.debug(f"[TestDriver] Setting event for sphere {sphere}")
                        self.ready_events[sphere].set()
                    else:
                        logger.warning(f"[TestDriver] No event registered for sphere {sphere}, known: {list(self.ready_events.keys())[-5:]}")

    def load_sphere_log(self) -> bool:
        """Load and parse the Python sphere log file."""
        try:
            with open(self.sphere_log_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        entry = json.loads(line)
                        if entry.get("type") == "state_update":
                            self.sphere_entries.append(entry)

            logger.info(f"Loaded {len(self.sphere_entries)} sphere entries from {self.sphere_log_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load sphere log: {e}")
            return False

    async def send_step_bounce(self, sphere: str) -> bool:
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
            await asyncio.wait_for(self.ready_events[sphere].wait(), timeout=60.0)
            logger.debug(f"[TestDriver] Received READY for sphere {sphere}")
            return True
        except asyncio.TimeoutError:
            logger.error(f"[TestDriver] Timeout waiting for READY for sphere {sphere}")
            logger.error(f"[TestDriver] Event state: {self.ready_events[sphere].is_set()}")
            logger.error(f"[TestDriver] Known events: {list(self.ready_events.keys())[-10:]}")
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

    async def check_locations(self, location_names: list[str]) -> bool:
        """
        Check the specified locations by sending LocationChecks to the server.

        Args:
            location_names: List of location names to check

        Returns:
            True if all locations were checked successfully
        """
        if not location_names:
            return True

        # Convert location names to IDs using the datapackage
        location_ids = []
        for name in location_names:
            loc_id = self.location_name_to_id.get(name)
            if loc_id is not None:
                location_ids.append(loc_id)
            else:
                logger.warning(f"[TestDriver] Unknown location: {name}")

        if not location_ids:
            return True

        # Send LocationChecks
        logger.info(f"[TestDriver] Checking {len(location_ids)} locations: {location_names[:3]}{'...' if len(location_names) > 3 else ''}")
        await self.send_msgs([{
            "cmd": "LocationChecks",
            "locations": location_ids
        }])

        # Give the server a moment to process
        await asyncio.sleep(0.1)
        return True

    def build_location_mapping(self):
        """Build location name to ID mapping from the datapackage."""
        if not self.game:
            logger.warning("[TestDriver] No game set, cannot build location mapping")
            return

        # location_names[game] is a dict of {location_id: location_name}
        # We need to invert it to get {location_name: location_id}
        try:
            id_to_name = self.location_names[self.game]
            self.location_name_to_id = {name: loc_id for loc_id, name in id_to_name.items()}
            logger.info(f"[TestDriver] Loaded {len(self.location_name_to_id)} location mappings for {self.game}")
        except Exception as e:
            logger.warning(f"[TestDriver] Failed to build location mapping: {e}")


async def run_test(ctx: TestDriverContext) -> bool:
    """Run the full test sequence."""
    logger.info("=" * 60)
    logger.info("Starting UT Comparison Test")
    logger.info("=" * 60)

    # Load sphere log
    if not ctx.load_sphere_log():
        return False

    # Wait for connection
    logger.info("Waiting for connection to server...")
    wait_count = 0
    while not ctx.slot:
        await asyncio.sleep(0.5)
        wait_count += 1
        if wait_count > 40:  # 20 second timeout
            logger.error("Connection failed - timeout waiting for slot assignment")
            return False
        if ctx.exit_event.is_set():
            logger.error("Connection failed - exit event set")
            return False

    logger.info(f"Connected as slot {ctx.slot} playing {ctx.game}")

    # Build location mappings
    ctx.build_location_mapping()

    # Give UT time to also connect and initialize
    logger.info("Waiting 3 seconds for Universal Tracker to initialize...")
    await asyncio.sleep(3)

    # Process each sphere entry
    all_passed = True
    total_locations_checked = 0

    for i, entry in enumerate(ctx.sphere_entries):
        sphere_index = str(entry.get("sphere_index", i))
        player_data = entry.get("player_data", {}).get(str(ctx.player_id), {})
        sphere_locations = player_data.get("sphere_locations", [])

        # Debug logging every 50 spheres
        if i % 50 == 0:
            logger.info(f"[TestDriver] Progress: entry {i}/{len(ctx.sphere_entries)}, sphere {sphere_index}")

        # Check the locations for this sphere FIRST
        # This sends items to UT before we ask it to log its state
        if sphere_locations:
            logger.debug(f"[TestDriver] Entry {i}: checking locations {sphere_locations}")
            await ctx.check_locations(sphere_locations)
            total_locations_checked += len(sphere_locations)
            # Give server time to process and send items to UT
            await asyncio.sleep(0.5)

        # Now send STEP and wait for READY
        # UT will log its state after receiving the items from our location checks
        logger.debug(f"[TestDriver] Entry {i}: sending STEP for sphere {sphere_index}")
        success = await ctx.send_step_bounce(sphere_index)
        if not success:
            all_passed = False
            logger.error(f"[TestDriver] Failed at sphere {sphere_index} (entry {i})")
            break

        logger.debug(f"[TestDriver] Entry {i}: STEP {sphere_index} completed")
        # Small delay between spheres
        await asyncio.sleep(0.2)

    # Send complete signal
    await ctx.send_complete_bounce()

    # Report results
    logger.info("=" * 60)
    if all_passed:
        logger.info(f"TEST COMPLETED: Processed {len(ctx.sphere_entries)} spheres, checked {total_locations_checked} locations")
    else:
        logger.error("TEST FAILED: Some steps did not complete successfully")
    logger.info("=" * 60)

    return all_passed


async def main(args):
    """Main entry point."""
    ctx = TestDriverContext(
        args.connect,
        args.password,
        args.sphere_log,
        player_id=args.player_id,
        game_name=args.game
    )
    ctx.auth = args.name

    # Start server connection
    ctx.server_task = asyncio.create_task(server_loop(ctx), name="server loop")

    # Run the test
    try:
        success = await run_test(ctx)
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
    parser = get_base_parser(description="Test driver for UT comparison testing")
    parser.add_argument('--name', default=None, required=True, help="Slot name to connect as")
    parser.add_argument('--sphere-log', required=True, help="Path to Python-generated sphere_log.jsonl")
    parser.add_argument('--player-id', type=int, default=1, help="Player ID to use (default: 1)")
    parser.add_argument('--game', default="Adventure", help="Game name to connect as (default: Adventure)")
    parser.add_argument("url", nargs="?", help="Archipelago connection url")

    args = parser.parse_args()

    # Handle URL argument
    if args.url:
        if not args.connect:
            args.connect = args.url

    if not args.connect:
        logger.error("Must provide server address via --connect or url argument")
        return 1

    if not os.path.exists(args.sphere_log):
        logger.error(f"Sphere log file not found: {args.sphere_log}")
        return 1

    return asyncio.run(main(args))


if __name__ == "__main__":
    sys.exit(launch())
