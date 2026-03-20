"""
Kivy-based GUI for running JSON Tools scripts.

Provides a menu to launch utility scripts and quick actions.
"""

import os
import queue
import subprocess
import sys
import threading
from pathlib import Path

os.environ.setdefault("KIVY_NO_CONSOLELOG", "1")
os.environ.setdefault("KIVY_NO_FILELOG", "1")
os.environ.setdefault("KIVY_NO_ARGS", "1")

from kivy.app import App
from kivy.clock import Clock
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.scrollview import ScrollView
from kivy.uix.textinput import TextInput
from kivy.uix.popup import Popup

from Utils import local_path


class ScriptAction:
    """Represents a script action that can be run."""
    def __init__(self, name: str, description: str, command: list = None,
                 script_path: str = None, working_dir: str = None):
        self.name = name
        self.description = description
        self.command = command  # Direct command to run
        self.script_path = script_path  # Path to script file
        self.working_dir = working_dir  # Working directory for command


# Define script categories and actions
SCRIPT_CATEGORIES = {
    "Dev Server": [
        ScriptAction(
            "Start Dev Server",
            "Start local HTTP server on port 8000 for the frontend",
            command=[sys.executable, "-m", "http.server", "8000"]
        ),
        ScriptAction(
            "Stop Dev Server",
            "Stop any running HTTP server on port 8000",
            command=[sys.executable, "-c",
                     "import subprocess, sys; "
                     "r = subprocess.run(['pkill', '-f', 'http.server 8000'] if sys.platform != 'win32' "
                     "else ['taskkill', '/F', '/FI', 'WINDOWTITLE eq http.server*'], "
                     "capture_output=True, text=True); "
                     "print('Server stopped.' if r.returncode == 0 else 'No server running.')"]
        ),
    ],
    "Setup": [
        ScriptAction(
            "Setup Dev Environment (Full)",
            "Run complete development environment setup",
            script_path="scripts/setup/setup_dev_environment.py"
        ),
        ScriptAction(
            "Check Prerequisites",
            "Verify Python and Node.js are installed",
            command=[sys.executable, "-c",
                     "import shutil; "
                     "print('[OK] Python:', shutil.which('python') or shutil.which('python3')); "
                     "print('[OK] Node:', shutil.which('node') or 'Not found'); "
                     "print('[OK] npm:', shutil.which('npm') or 'Not found'); "
                     "input('Press Enter to close...')"]
        ),
        ScriptAction(
            "Set Up Virtual Environment",
            "Create .venv Python virtual environment",
            command=[sys.executable, "-m", "venv", ".venv"]
        ),
        ScriptAction(
            "Install Dependencies",
            "Run ModuleUpdate.py to install game dependencies",
            command=[sys.executable, "ModuleUpdate.py", "--yes"]
        ),
        ScriptAction(
            "Generate Template Files",
            "Generate YAML template files for all games",
            command=[sys.executable, "-c",
                     "from Options import generate_yaml_templates; "
                     "generate_yaml_templates('Players/Templates'); "
                     "print('Templates generated!'); "
                     "input('Press Enter to close...')"]
        ),
        ScriptAction(
            "Set Up Host Configuration",
            "Create host.yaml with minimal-spoilers preset",
            command=[sys.executable, "Launcher.py", "--update_settings"]
        ),
        ScriptAction(
            "Install Node.js Dependencies",
            "Run npm install for test infrastructure",
            command=["npm", "install"]
        ),
    ],
    "Update Host Settings": [
        ScriptAction(
            "Normal (Disable JSON Features)",
            "Reset to normal Archipelago settings (no JSON export)",
            script_path="scripts/setup/update_host_settings.py",
            command=[sys.executable, "scripts/setup/update_host_settings.py", "normal"]
        ),
        ScriptAction(
            "Minimal Spoilers (Enable JSON)",
            "Enable JSON export with minimal spoiler data",
            script_path="scripts/setup/update_host_settings.py",
            command=[sys.executable, "scripts/setup/update_host_settings.py", "minimal-spoilers"]
        ),
        ScriptAction(
            "Full Spoilers (Extended Logs)",
            "Enable JSON export with full sphere log data",
            script_path="scripts/setup/update_host_settings.py",
            command=[sys.executable, "scripts/setup/update_host_settings.py", "full-spoilers"]
        ),
        ScriptAction(
            "UT Hybrid",
            "Config picks best tracking mode per game (uses tracking-mode-config.json)",
            script_path="scripts/setup/update_host_settings.py",
            command=[sys.executable, "scripts/setup/update_host_settings.py", "ut-hybrid"]
        ),
        ScriptAction(
            "UT Worldgen",
            "Export rules.json for worldgen-based tracking",
            script_path="scripts/setup/update_host_settings.py",
            command=[sys.executable, "scripts/setup/update_host_settings.py", "ut-worldgen"]
        ),
        ScriptAction(
            "UT Pickle",
            "Export tracker pickle for pickle-based tracking",
            script_path="scripts/setup/update_host_settings.py",
            command=[sys.executable, "scripts/setup/update_host_settings.py", "ut-pickle"]
        ),
        ScriptAction(
            "UT Original",
            "YAML-based tracking (no extra exports needed)",
            script_path="scripts/setup/update_host_settings.py",
            command=[sys.executable, "scripts/setup/update_host_settings.py", "ut-original"]
        ),
    ],
    "Patches": [
        ScriptAction(
            "Apply ROM-less Patches",
            "Enable generation without ROM files (for testing)",
            command=None  # Handled specially
        ),
        ScriptAction(
            "Revert ROM-less Patches",
            "Restore original world files from backups",
            command=None  # Handled specially
        ),
        ScriptAction(
            "Enable Auto Monkey Patches",
            "Use runtime hooks on every AP startup (no file changes)",
            command=None  # Handled specially
        ),
        ScriptAction(
            "Disable Auto Monkey Patches",
            "Stop using runtime hooks on startup",
            command=None  # Handled specially
        ),
    ],
    "Quick Actions": [
        ScriptAction(
            "Test Adventure Generation",
            "Generate Adventure seed with Generate.py",
            command=[sys.executable, "Generate.py",
                     "--weights_file_path", "Templates/Adventure.yaml",
                     "--multi", "1", "--seed", "1"]
        ),
        ScriptAction(
            "Test Adventure Spoiler",
            "Run spoiler test for Adventure preset",
            command=["npm", "test", "--", "--mode=test-spoilers", "--game=adventure", "--seed=1"]
        ),
        ScriptAction(
            "Adventure Full Test",
            "Run full test-all-templates.py for Adventure",
            script_path="scripts/test/test-all-templates.py",
            command=[sys.executable, "scripts/test/test-all-templates.py",
                     "--include-list", "Adventure.yaml", "--minimal-spoilers", "-p"]
        ),
        ScriptAction(
            "Test Adventure UT Worldgen",
            "Run UT worldgen fuzz test for Adventure",
            command=[sys.executable, "scripts/test/test-all-ut-fuzz.py",
                     "--include-list", "Adventure.yaml", "--runs", "10",
                     "--ut-version", "worldgen", "--no-use-tracking-config",
                     "--starting-seed", "1"]
        ),
        ScriptAction(
            "Test Adventure UT Pickle",
            "Run UT pickle fuzz test for Adventure",
            command=[sys.executable, "scripts/test/test-all-ut-fuzz.py",
                     "--include-list", "Adventure.yaml", "--runs", "10",
                     "--ut-version", "pickle", "--no-use-tracking-config",
                     "--starting-seed", "1"]
        ),
        ScriptAction(
            "Test ALTTP Generation",
            "Generate ALTTP seed with Generate.py",
            command=[sys.executable, "Generate.py",
                     "--weights_file_path", "Templates/A Link to the Past.yaml",
                     "--multi", "1", "--seed", "1"]
        ),
        ScriptAction(
            "Test ALTTP Spoiler",
            "Run spoiler test for ALTTP preset",
            command=["npm", "test", "--", "--mode=test-spoilers", "--game=alttp", "--seed=1"]
        ),
        ScriptAction(
            "ALTTP Full Test",
            "Run full test-all-templates.py for ALTTP",
            script_path="scripts/test/test-all-templates.py",
            command=[sys.executable, "scripts/test/test-all-templates.py",
                     "--include-list", "A Link to the Past.yaml", "--minimal-spoilers", "-p"]
        ),
        ScriptAction(
            "Test ALTTP UT Worldgen",
            "Run UT worldgen fuzz test for ALTTP",
            command=[sys.executable, "scripts/test/test-all-ut-fuzz.py",
                     "--include-list", "A Link to the Past.yaml", "--runs", "10",
                     "--ut-version", "worldgen", "--no-use-tracking-config",
                     "--starting-seed", "1"]
        ),
        ScriptAction(
            "Test ALTTP UT Pickle",
            "Run UT pickle fuzz test for ALTTP",
            command=[sys.executable, "scripts/test/test-all-ut-fuzz.py",
                     "--include-list", "A Link to the Past.yaml", "--runs", "10",
                     "--ut-version", "pickle", "--no-use-tracking-config",
                     "--starting-seed", "1"]
        ),
    ],
}


class ScriptsApp(App):
    """Scripts menu application."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.title = "JSON Tools Scripts"
        self.output_text = ""

    def build(self):
        """Build the UI."""
        root = BoxLayout(orientation='vertical', padding=10, spacing=5)

        # Header
        header = Label(
            text='JSON Tools Scripts',
            size_hint_y=None,
            height=40,
            font_size=24,
        )
        root.add_widget(header)

        # Check if scripts are installed
        scripts_path = Path(local_path("scripts"))
        scripts_available = scripts_path.exists()

        # Scrollable content
        scroll = ScrollView()
        content = BoxLayout(orientation='vertical', spacing=5, size_hint_y=None, padding=10)
        content.bind(minimum_height=content.setter('height'))

        for category, actions in SCRIPT_CATEGORIES.items():
            # Skip scripts category if not installed (but keep patches)
            if category not in ["Dev Server", "Patches", "Update Host Settings"] and not scripts_available:
                continue

            # Category header
            cat_label = Label(
                text=f'[b]{category}[/b]',
                markup=True,
                size_hint_y=None,
                height=35,
                halign='left',
            )
            cat_label.bind(size=cat_label.setter('text_size'))
            content.add_widget(cat_label)

            for action in actions:
                row = BoxLayout(size_hint_y=None, height=45, spacing=10)

                # Run button
                run_btn = Button(
                    text='Run',
                    size_hint_x=None,
                    width=60,
                )
                run_btn.action = action
                run_btn.category = category
                run_btn.bind(on_press=self.run_action)
                row.add_widget(run_btn)

                # Action info
                info = Label(
                    text=f'{action.name}\n[size=12]{action.description}[/size]',
                    markup=True,
                    halign='left',
                    valign='middle',
                )
                info.bind(size=info.setter('text_size'))
                row.add_widget(info)

                content.add_widget(row)

            # Spacer
            content.add_widget(Label(text='', size_hint_y=None, height=10))

        if not scripts_available:
            content.add_widget(Label(
                text='[i]Install the Scripts component to access setup and test scripts.[/i]',
                markup=True,
                size_hint_y=None,
                height=40,
            ))

        scroll.add_widget(content)
        root.add_widget(scroll)

        # Buttons
        button_box = BoxLayout(size_hint_y=None, height=50, spacing=10)

        if scripts_available:
            open_folder_btn = Button(text='Open Scripts Folder')
            open_folder_btn.bind(on_press=self.open_scripts_folder)
            button_box.add_widget(open_folder_btn)

        close_btn = Button(text='Close')
        close_btn.bind(on_press=self.stop)
        button_box.add_widget(close_btn)

        root.add_widget(button_box)

        return root

    def run_action(self, instance):
        """Run a script action."""
        action = instance.action
        category = instance.category

        # Handle patch actions specially
        if category == "Patches":
            self.run_patch_action(action)
            return

        # Run command
        if action.command:
            self.run_command_with_output(action.command, action.name)
        elif action.script_path:
            script_path = Path(local_path(action.script_path))
            if script_path.exists():
                self.run_command_with_output([sys.executable, str(script_path)], action.name)
            else:
                self.show_message("Error", f"Script not found: {action.script_path}")

    def run_patch_action(self, action):
        """Handle patch-related actions."""
        action_name = action.name.lower()

        if "monkey" in action_name and "enable" in action_name:
            self.enable_auto_monkey_patches()
        elif "monkey" in action_name and "disable" in action_name:
            self.disable_auto_monkey_patches()
        elif "rom-less" in action_name and "apply" in action_name:
            self.apply_romless_patches()
        elif "rom-less" in action_name and "revert" in action_name:
            self.revert_romless_patches()

    def apply_romless_patches(self):
        """Apply ROM-less patches."""
        def do_apply():
            try:
                from ..installer.romless_patcher import apply_romless_patches
                from ..config import load_config
                config = load_config()
                result = apply_romless_patches(config)
                if result.success:
                    msg = f"Applied ROM-less patches to: {', '.join(result.patched_worlds)}"
                    if result.warnings:
                        msg += f"\n\nWarnings: {', '.join(result.warnings)}"
                    Clock.schedule_once(lambda dt: self.show_message("Success", msg))
                else:
                    Clock.schedule_once(lambda dt: self.show_message("Error",
                        f"Failed: {', '.join(result.errors)}"))
            except Exception as e:
                error_msg = str(e)
                Clock.schedule_once(lambda dt: self.show_message("Error", error_msg))

        thread = threading.Thread(target=do_apply)
        thread.daemon = True
        thread.start()

    def revert_romless_patches(self):
        """Revert ROM-less patches."""
        def do_revert():
            try:
                from ..installer.romless_patcher import revert_romless_patches
                from ..config import load_config
                config = load_config()
                result = revert_romless_patches(config)
                if result.success:
                    msg = f"Reverted: {', '.join(result.patched_worlds)}"
                    if result.warnings:
                        msg += f"\n\nWarnings: {', '.join(result.warnings)}"
                    Clock.schedule_once(lambda dt: self.show_message("Success", msg))
                else:
                    Clock.schedule_once(lambda dt: self.show_message("Error",
                        f"Failed: {', '.join(result.errors)}"))
            except Exception as e:
                error_msg = str(e)
                Clock.schedule_once(lambda dt: self.show_message("Error", error_msg))

        thread = threading.Thread(target=do_revert)
        thread.daemon = True
        thread.start()

    def enable_auto_monkey_patches(self):
        """Enable auto monkey patches (persists across sessions)."""
        def do_enable():
            try:
                from ..config import load_config, save_config
                from ..monkey_patches import install_hooks, get_installed_hooks

                # Update config to use monkey patching
                config = load_config()
                config.patches.method = "monkey"
                save_config(config)

                # Also install for current session
                results = install_hooks()
                installed = get_installed_hooks()
                success_count = sum(1 for v in results.values() if v)

                msg = f"Auto monkey patches enabled.\n\nInstalled {success_count} hooks for current session: {', '.join(installed)}\n\nHooks will auto-install on future AP startups."
                Clock.schedule_once(lambda dt: self.show_message("Success", msg))
            except Exception as e:
                error_msg = str(e)
                Clock.schedule_once(lambda dt: self.show_message("Error", error_msg))

        thread = threading.Thread(target=do_enable)
        thread.daemon = True
        thread.start()

    def disable_auto_monkey_patches(self):
        """Disable auto monkey patches."""
        def do_disable():
            try:
                from ..config import load_config, save_config
                from ..monkey_patches import uninstall_hooks, get_installed_hooks

                # Update config to not use monkey patching
                config = load_config()
                config.patches.method = "none"
                save_config(config)

                # Uninstall from current session if any
                installed_before = get_installed_hooks()
                if installed_before:
                    uninstall_hooks()
                    msg = f"Auto monkey patches disabled.\n\nUninstalled hooks from current session: {', '.join(installed_before)}"
                else:
                    msg = "Auto monkey patches disabled.\n\nNo hooks were active in current session."

                Clock.schedule_once(lambda dt: self.show_message("Success", msg))
            except Exception as e:
                error_msg = str(e)
                Clock.schedule_once(lambda dt: self.show_message("Error", error_msg))

        thread = threading.Thread(target=do_disable)
        thread.daemon = True
        thread.start()

    def run_command_with_output(self, command: list, title: str):
        """Run a command and show its output in a popup window."""
        project_root = local_path()

        # Build the output popup
        content = BoxLayout(orientation='vertical', padding=10, spacing=5)

        output_widget = TextInput(
            text='',
            readonly=True,
            size_hint_y=1,
            multiline=True,
            font_size='12sp',
            background_color=(0.1, 0.1, 0.1, 1),
            foreground_color=(0.9, 0.9, 0.9, 1),
        )
        content.add_widget(output_widget)

        close_btn = Button(text='Close', size_hint_y=None, height=40)
        content.add_widget(close_btn)

        popup = Popup(title=title, content=content, size_hint=(0.95, 0.85))
        close_btn.bind(on_press=popup.dismiss)
        popup.open()

        output_queue = queue.Queue()

        def read_output(process):
            """Read subprocess output line by line into the queue."""
            try:
                for line in process.stdout:
                    output_queue.put(line)
            except Exception:
                pass
            finally:
                process.wait()
                exit_code = process.returncode
                if exit_code == 0:
                    output_queue.put(f"\n--- Finished (exit code {exit_code}) ---\n")
                else:
                    output_queue.put(f"\n--- Failed (exit code {exit_code}) ---\n")
                output_queue.put(None)  # Sentinel

        def drain_queue(dt):
            """Drain queued output into the text widget (runs on main thread)."""
            try:
                while True:
                    line = output_queue.get_nowait()
                    if line is None:
                        # Process finished, stop polling
                        Clock.unschedule(drain_queue)
                        return
                    output_widget.text += line
                    # Auto-scroll to bottom
                    output_widget.cursor = (0, len(output_widget._lines) - 1)
            except queue.Empty:
                pass

        try:
            # Strip 'input()' calls from inline Python commands since we capture output
            cleaned_command = list(command)
            for i, arg in enumerate(cleaned_command):
                if isinstance(arg, str) and "input('Press Enter" in arg:
                    cleaned_command[i] = arg.replace(
                        "input('Press Enter to close...')", "pass"
                    )

            env = os.environ.copy()
            env["PYTHONUNBUFFERED"] = "1"

            process = subprocess.Popen(
                cleaned_command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=project_root,
                env=env,
                text=True,
                bufsize=1,
            )

            reader_thread = threading.Thread(target=read_output, args=(process,))
            reader_thread.daemon = True
            reader_thread.start()

            # Poll the queue every 100ms to update the UI
            Clock.schedule_interval(drain_queue, 0.1)

            # Kill the subprocess if the popup is closed early
            def on_popup_dismiss(instance):
                if process.poll() is None:
                    process.terminate()
                Clock.unschedule(drain_queue)

            popup.bind(on_dismiss=on_popup_dismiss)

        except Exception as e:
            output_widget.text = f"Failed to run command: {e}"

    def open_scripts_folder(self, instance):
        """Open the scripts folder in file manager."""
        scripts_path = Path(local_path("scripts"))

        if not scripts_path.exists():
            self.show_message("Error", "Scripts folder not found")
            return

        try:
            if sys.platform == 'win32':
                os.startfile(str(scripts_path))
            elif sys.platform == 'darwin':
                subprocess.Popen(['open', str(scripts_path)])
            else:
                subprocess.Popen(['xdg-open', str(scripts_path)])
        except Exception as e:
            self.show_message("Error", f"Failed to open folder: {e}")

    def show_message(self, title: str, message: str):
        """Show a popup message."""
        content = BoxLayout(orientation='vertical', padding=10)

        # Use ScrollView for long messages
        scroll = ScrollView(size_hint_y=0.8)
        msg_label = Label(
            text=message,
            size_hint_y=None,
            halign='left',
            valign='top',
        )
        msg_label.bind(texture_size=lambda *x: setattr(msg_label, 'height', msg_label.texture_size[1]))
        msg_label.bind(size=msg_label.setter('text_size'))
        scroll.add_widget(msg_label)
        content.add_widget(scroll)

        btn = Button(text='OK', size_hint_y=None, height=40)
        content.add_widget(btn)

        popup = Popup(title=title, content=content, size_hint=(0.9, 0.6))
        btn.bind(on_press=popup.dismiss)
        popup.open()


def run_scripts_gui(*args):
    """Run the scripts GUI."""
    app = ScriptsApp()
    app.run()


if __name__ == "__main__":
    run_scripts_gui()
