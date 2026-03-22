"""
Kivy-based GUI for JSON Tools Installer.

Provides a graphical interface for installing and managing JSON Tools.
"""

import threading
from typing import Optional, List

# Kivy setup must happen before other kivy imports
import os
os.environ.setdefault("KIVY_NO_CONSOLELOG", "1")
os.environ.setdefault("KIVY_NO_FILELOG", "1")
os.environ.setdefault("KIVY_NO_ARGS", "1")

from kivy.app import App
from kivy.clock import Clock
from kivy.core.window import Window
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.checkbox import CheckBox
from kivy.uix.progressbar import ProgressBar
from kivy.uix.scrollview import ScrollView
from kivy.uix.textinput import TextInput
from kivy.uix.popup import Popup
from kivy.properties import StringProperty, BooleanProperty, NumericProperty

from ..config import load_config, save_config, InstallerConfig, configure_export_settings, EXPORT_PRESETS
from ..installer.version_detector import detect_ap_version, get_version_support_status
from ..installer.downloader import download_archive, get_latest_commit_hash, check_connectivity, check_installer_compatibility
from ..installer.extractor import extract_tools, COMPONENTS, DEFAULT_COMPONENTS, list_installed_components
from ..installer.romless_patcher import apply_romless_patches, revert_romless_patches


class InstallerApp(App):
    """Main installer application."""

    # Properties for UI binding
    status_text = StringProperty("Ready")
    progress_value = NumericProperty(0)
    is_working = BooleanProperty(False)

    version_stable = BooleanProperty(True)
    version_dev = BooleanProperty(False)

    # Component properties (defaults set from DEFAULT_COMPONENTS)
    comp_exporter = BooleanProperty(True)
    comp_rule_builder = BooleanProperty(False)
    comp_world_generator = BooleanProperty(True)
    comp_frontend = BooleanProperty(True)
    comp_presets = BooleanProperty(False)
    comp_docs = BooleanProperty(True)
    comp_scripts = BooleanProperty(True)
    comp_romless_patches = BooleanProperty(True)
    comp_demo_worlds = BooleanProperty(False)
    comp_tracker = BooleanProperty(True)
    comp_testing = BooleanProperty(True)
    comp_worldgen_worlds = BooleanProperty(False)

    # Patch options
    apply_monkey_patch = BooleanProperty(True)
    apply_romless_patches_prop = BooleanProperty(False)

    # Export settings configuration
    configure_export = BooleanProperty(True)
    export_preset_normal = BooleanProperty(True)
    export_preset_minimal = BooleanProperty(False)

    # Store checkbox references for updating
    component_checkboxes = {}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.installer_config: InstallerConfig = load_config()
        self.title = "JSON Tools Installer"

    def build(self):
        """Build the UI."""
        Window.maximize()
        root = BoxLayout(orientation='vertical', padding=10, spacing=10)

        # Header
        header = Label(
            text='JSON Tools Installer',
            size_hint_y=None,
            height=40,
            font_size=24,
        )
        root.add_widget(header)

        # AP Version info
        version_info = detect_ap_version()
        ap_info_box = BoxLayout(size_hint_y=None, height=60, orientation='vertical')
        ap_info_box.add_widget(Label(
            text=f'Archipelago Version: {version_info.version_string}',
            size_hint_y=None,
            height=30,
        ))
        ap_info_box.add_widget(Label(
            text=f'Support: {get_version_support_status(version_info)}',
            size_hint_y=None,
            height=30,
        ))
        root.add_widget(ap_info_box)

        # Version selection (stable/dev)
        version_select_box = BoxLayout(size_hint_y=None, height=40)
        version_select_box.add_widget(Label(text='Version:', size_hint_x=0.3))

        stable_box = BoxLayout(size_hint_x=0.3)
        stable_cb = CheckBox(group='version', active=True, size_hint_x=None, width=40)
        stable_cb.bind(active=self.on_version_stable)
        stable_box.add_widget(stable_cb)
        stable_label = Label(text='Stable', halign='left', valign='middle')
        stable_label.bind(size=stable_label.setter('text_size'))
        stable_box.add_widget(stable_label)
        version_select_box.add_widget(stable_box)

        dev_box = BoxLayout(size_hint_x=0.3)
        dev_cb = CheckBox(group='version', active=False, size_hint_x=None, width=40)
        dev_cb.bind(active=self.on_version_dev)
        dev_box.add_widget(dev_cb)
        dev_label = Label(text='Dev', halign='left', valign='middle')
        dev_label.bind(size=dev_label.setter('text_size'))
        dev_box.add_widget(dev_label)
        version_select_box.add_widget(dev_box)

        root.add_widget(version_select_box)

        # Components section header with Check All button
        comp_header = BoxLayout(size_hint_y=None, height=35, spacing=10)
        comp_label = Label(
            text='Components:',
            size_hint_x=0.7,
            halign='left',
            valign='middle',
        )
        comp_label.bind(size=comp_label.setter('text_size'))
        comp_header.add_widget(comp_label)

        check_all_btn = Button(
            text='Check All',
            size_hint_x=0.15,
        )
        check_all_btn.bind(on_press=self.do_check_all)
        comp_header.add_widget(check_all_btn)

        uncheck_all_btn = Button(
            text='Uncheck All',
            size_hint_x=0.15,
        )
        uncheck_all_btn.bind(on_press=self.do_uncheck_all)
        comp_header.add_widget(uncheck_all_btn)

        root.add_widget(comp_header)

        # Component checkboxes in a scrollable container
        row_height = 40
        spacing = 5
        num_components = len(COMPONENTS)
        # Total height = rows + spacing between rows
        total_height = (num_components * row_height) + ((num_components - 1) * spacing)
        components_box = BoxLayout(
            orientation='vertical',
            size_hint_y=None,
            height=total_height,
            spacing=spacing,
        )

        for name, comp in COMPONENTS.items():
            row = BoxLayout(size_hint_y=None, height=row_height)

            # Checkbox with fixed width, default based on DEFAULT_COMPONENTS
            cb = CheckBox(
                active=name in DEFAULT_COMPONENTS,
                size_hint_x=None,
                width=40,
            )
            cb.bind(active=lambda instance, value, n=name: self.on_component_toggle(n, value))
            self.component_checkboxes[name] = cb
            row.add_widget(cb)

            # Label with proper text alignment
            label = Label(
                text=f'{comp.display_name} ({comp.size_estimate_mb:.1f}MB)',
                halign='left',
                valign='middle',
                size_hint_x=0.4,
            )
            label.bind(size=label.setter('text_size'))
            row.add_widget(label)

            # Description label
            desc_label = Label(
                text=comp.description,
                halign='left',
                valign='middle',
                size_hint_x=0.6,
            )
            desc_label.bind(size=desc_label.setter('text_size'))
            row.add_widget(desc_label)

            components_box.add_widget(row)

        # Wrap in ScrollView - takes all remaining vertical space
        scroll_view = ScrollView(
            do_scroll_x=False,
            bar_width=10,
        )
        scroll_view.add_widget(components_box)
        root.add_widget(scroll_view)

        # Patch options
        options_label = Label(
            text='Apply patches after download:',
            size_hint_y=None,
            height=25,
            halign='left',
        )
        options_label.bind(size=options_label.setter('text_size'))
        root.add_widget(options_label)

        options_box = BoxLayout(size_hint_y=None, height=35, spacing=10)

        # Monkey patch checkbox (default checked)
        monkey_row = BoxLayout(size_hint_x=0.5)
        self.monkey_patch_cb = CheckBox(
            active=self.apply_monkey_patch,
            size_hint_x=None,
            width=40,
        )
        self.monkey_patch_cb.bind(active=self.on_monkey_patch_toggle)
        monkey_row.add_widget(self.monkey_patch_cb)
        monkey_label = Label(
            text='Monkey Patch for JSON Export',
            halign='left',
            valign='middle',
        )
        monkey_label.bind(size=monkey_label.setter('text_size'))
        monkey_row.add_widget(monkey_label)
        options_box.add_widget(monkey_row)

        # ROM-less patches checkbox (default unchecked)
        romless_row = BoxLayout(size_hint_x=0.5)
        self.romless_patch_cb = CheckBox(
            active=self.apply_romless_patches_prop,
            size_hint_x=None,
            width=40,
        )
        self.romless_patch_cb.bind(active=lambda inst, val: setattr(self, 'apply_romless_patches_prop', val))
        romless_row.add_widget(self.romless_patch_cb)
        romless_label = Label(
            text='ROM-less World File Patches',
            halign='left',
            valign='middle',
        )
        romless_label.bind(size=romless_label.setter('text_size'))
        romless_row.add_widget(romless_label)
        options_box.add_widget(romless_row)

        root.add_widget(options_box)

        # Export settings configuration
        export_label = Label(
            text='Configure export settings in host.yaml:',
            size_hint_y=None,
            height=25,
            halign='left',
        )
        export_label.bind(size=export_label.setter('text_size'))
        root.add_widget(export_label)

        export_box = BoxLayout(size_hint_y=None, height=35, spacing=10)

        # Configure export checkbox
        config_export_row = BoxLayout(size_hint_x=0.4)
        self.config_export_cb = CheckBox(
            active=self.configure_export,
            size_hint_x=None,
            width=40,
        )
        self.config_export_cb.bind(active=lambda inst, val: setattr(self, 'configure_export', val))
        config_export_row.add_widget(self.config_export_cb)
        config_label = Label(
            text='Configure host.yaml',
            halign='left',
            valign='middle',
        )
        config_label.bind(size=config_label.setter('text_size'))
        config_export_row.add_widget(config_label)
        export_box.add_widget(config_export_row)

        # Normal preset radio
        normal_row = BoxLayout(size_hint_x=0.3)
        self.preset_normal_cb = CheckBox(
            group='export_preset',
            active=True,
            size_hint_x=None,
            width=40,
        )
        self.preset_normal_cb.bind(active=self.on_preset_normal)
        normal_row.add_widget(self.preset_normal_cb)
        normal_label = Label(
            text='Disable JSON Export',
            halign='left',
            valign='middle',
        )
        normal_label.bind(size=normal_label.setter('text_size'))
        normal_row.add_widget(normal_label)
        export_box.add_widget(normal_row)

        # Minimal-spoilers preset radio
        minimal_row = BoxLayout(size_hint_x=0.3)
        self.preset_minimal_cb = CheckBox(
            group='export_preset',
            active=False,
            size_hint_x=None,
            width=40,
        )
        self.preset_minimal_cb.bind(active=self.on_preset_minimal)
        minimal_row.add_widget(self.preset_minimal_cb)
        minimal_label = Label(
            text='Enable JSON Export - Minimal Spoilers',
            halign='left',
            valign='middle',
        )
        minimal_label.bind(size=minimal_label.setter('text_size'))
        minimal_row.add_widget(minimal_label)
        export_box.add_widget(minimal_row)

        root.add_widget(export_box)

        # Status area
        self.status_label = Label(
            text=self.status_text,
            size_hint_y=None,
            height=25,
        )
        root.add_widget(self.status_label)

        # Progress bar
        self.progress = ProgressBar(
            max=100,
            value=0,
            size_hint_y=None,
            height=20,
        )
        root.add_widget(self.progress)

        # Buttons
        button_box = BoxLayout(size_hint_y=None, height=50, spacing=10)

        install_btn = Button(text='Install / Update')
        install_btn.bind(on_press=self.do_install)
        button_box.add_widget(install_btn)

        uninstall_btn = Button(text='Uninstall')
        uninstall_btn.bind(on_press=self.do_uninstall)
        button_box.add_widget(uninstall_btn)

        revert_btn = Button(text='Revert Patches')
        revert_btn.bind(on_press=self.do_revert)
        button_box.add_widget(revert_btn)

        root.add_widget(button_box)

        # Bottom button row (Help and Close)
        bottom_btn_box = BoxLayout(size_hint_y=None, height=40, spacing=10)

        help_btn = Button(text='Help')
        help_btn.bind(on_press=self.show_help)
        bottom_btn_box.add_widget(help_btn)

        close_btn = Button(text='Close')
        close_btn.bind(on_press=self.stop)
        bottom_btn_box.add_widget(close_btn)

        root.add_widget(bottom_btn_box)

        return root

    def on_version_stable(self, instance, value):
        """Handle stable version selection."""
        if value:
            self.version_stable = True
            self.version_dev = False

    def on_version_dev(self, instance, value):
        """Handle dev version selection."""
        if value:
            self.version_dev = True
            self.version_stable = False

    def on_component_toggle(self, name: str, value: bool):
        """Handle component checkbox toggle."""
        # Map component name to property
        prop_name = f'comp_{name}'
        if hasattr(self, prop_name):
            setattr(self, prop_name, value)

        # Show warning when enabling components that replace vanilla files
        if value and name == "rule_builder":
            self._show_rule_builder_warning()

    def _show_rule_builder_warning(self):
        """Show a warning about rule_builder replacing vanilla files."""
        content = BoxLayout(orientation='vertical', padding=10, spacing=10)
        warn_text = TextInput(
            text=(
                "WARNING: Installing Rule Builder will replace the vanilla\n"
                "rule_builder/ directory with the extended version from\n"
                "this project.\n\n"
                "A backup of the existing rule_builder/ directory will be\n"
                "saved to json_tools_backups/components/rule_builder/.\n\n"
                "The original will be restored automatically when you\n"
                "uninstall. To restore manually:\n\n"
                "  source .venv/bin/activate\n"
                "  python -m worlds.json_tools_installer.cli.install --restore-rule-builder"
            ),
            readonly=True,
            size_hint_y=0.8,
            background_color=(0.2, 0.2, 0.2, 1),
            foreground_color=(1, 1, 1, 1),
        )
        content.add_widget(warn_text)

        ok_btn = Button(text='OK', size_hint_y=None, height=40)
        content.add_widget(ok_btn)

        popup = Popup(
            title='Rule Builder Warning',
            content=content,
            size_hint=(0.7, 0.5),
        )
        ok_btn.bind(on_press=popup.dismiss)
        popup.open()

    def on_monkey_patch_toggle(self, instance, value: bool):
        """Handle monkey patch checkbox toggle."""
        self.apply_monkey_patch = value

    def on_preset_normal(self, instance, value: bool):
        """Handle normal preset selection."""
        if value:
            self.export_preset_normal = True
            self.export_preset_minimal = False

    def on_preset_minimal(self, instance, value: bool):
        """Handle minimal-spoilers preset selection."""
        if value:
            self.export_preset_minimal = True
            self.export_preset_normal = False

    def get_selected_export_preset(self) -> str:
        """Get the selected export preset name."""
        return "minimal-spoilers" if self.export_preset_minimal else "normal"

    def do_check_all(self, instance):
        """Check all component checkboxes."""
        for name, cb in self.component_checkboxes.items():
            cb.active = True
            self.on_component_toggle(name, True)

    def do_uncheck_all(self, instance):
        """Uncheck all component checkboxes."""
        for name, cb in self.component_checkboxes.items():
            cb.active = False
            self.on_component_toggle(name, False)

    def get_selected_components(self) -> List[str]:
        """Get list of selected component names."""
        components = []
        for name in COMPONENTS.keys():
            prop_name = f'comp_{name}'
            if hasattr(self, prop_name) and getattr(self, prop_name):
                components.append(name)
        return components

    def get_selected_version(self) -> str:
        """Get selected version string."""
        return 'dev' if self.version_dev else 'stable'

    def update_status(self, text: str):
        """Update status text (thread-safe)."""
        Clock.schedule_once(lambda dt: setattr(self.status_label, 'text', text))

    def update_progress(self, value: float):
        """Update progress bar (thread-safe)."""
        Clock.schedule_once(lambda dt: setattr(self.progress, 'value', value))

    def show_message(self, title: str, message: str):
        """Show a popup message."""
        def show(dt):
            content = BoxLayout(orientation='vertical', padding=10)
            content.add_widget(Label(text=message))
            btn = Button(text='OK', size_hint_y=None, height=40)
            content.add_widget(btn)

            popup = Popup(title=title, content=content, size_hint=(0.8, 0.5))
            btn.bind(on_press=popup.dismiss)
            popup.open()

        Clock.schedule_once(show)

    def show_help(self, instance):
        """Show help information about the installer."""
        help_text = """JSON Tools Installer Help

PATCH OPTIONS

[b]Monkey Patch for JSON Export[/b] (Recommended)
Runtime patching that hooks into Archipelago without modifying files. Safe, reversible, and works across AP versions. This is the only patching needed for JSON export.

[b]ROM-less World File Patches[/b]
Optional patches that allow seed generation for games that normally require ROM files. Useful for testing. Includes settings.py (for skip_required_files) and worlds/RomlessUtils.py (for check_rom_available).

EXPORT SETTINGS
Configure how Archipelago exports game data to host.yaml:

[b]Configure host.yaml[/b]
When enabled, the installer automatically adds export settings to your host.yaml file. This eliminates the need to manually run setup scripts after installation.

[b]Disable JSON Export[/b]
Standard settings with JSON export disabled. Use this if you only want the tools installed but don't need automatic JSON export during seed generation.

[b]Enable JSON Export - Minimal Spoilers[/b]
Enables JSON rules export and sphere logging. This is what you need to use the frontend web UI for viewing game logic and playthroughs. Automatically updates frontend presets when generating seeds.

COMPONENTS
Select which parts of JSON Tools to install:
- Core modules (exporter, rule_builder, world_generator)
- Frontend web UI for viewing game logic
- Scripts for testing and setup
- Documentation

VERSION
- Stable: Release-quality code from JSONExport branch
- Dev: Latest development code (may be unstable)

For more information, see the README.md file."""

        content = BoxLayout(orientation='vertical', padding=10, spacing=10)

        # Use ScrollView for the help text
        scroll = ScrollView(size_hint_y=0.9, do_scroll_x=False)
        help_label = Label(
            text=help_text,
            markup=True,
            halign='left',
            valign='top',
            size_hint=(1, None),
            text_size=(None, None),
        )
        # Bind width to scroll width (minus padding) for text wrapping
        def update_text_width(instance, value):
            help_label.text_size = (value - 20, None)
        scroll.bind(width=update_text_width)
        # Bind height to texture height for scrolling
        help_label.bind(texture_size=lambda inst, size: setattr(inst, 'height', size[1]))
        scroll.add_widget(help_label)
        content.add_widget(scroll)

        ok_btn = Button(text='OK', size_hint_y=None, height=40)
        content.add_widget(ok_btn)

        popup = Popup(
            title='JSON Tools Installer Help',
            content=content,
            size_hint=(0.9, 0.85),
        )
        ok_btn.bind(on_press=popup.dismiss)
        popup.open()

    def do_install(self, instance):
        """Start installation in background thread."""
        if self.is_working:
            return

        self.is_working = True
        thread = threading.Thread(target=self._install_thread)
        thread.daemon = True
        thread.start()

    def _install_thread(self):
        """Installation logic (runs in background thread)."""
        try:
            import tempfile
            from pathlib import Path

            version = self.get_selected_version()
            components = self.get_selected_components()
            source = self.installer_config.get_source(version)

            self.update_status(f"Checking connectivity...")
            self.update_progress(5)

            if not check_connectivity():
                self.show_message("Error", "Cannot reach GitHub. Check your internet connection.")
                return

            self.update_status(f"Checking installer compatibility...")
            self.update_progress(7)

            compat = check_installer_compatibility(source)
            if not compat.compatible:
                if compat.error:
                    self.show_message("Error", compat.error)
                else:
                    error_msg = f"Installer version {compat.current_version} is too old.\n"
                    error_msg += f"Minimum required: {compat.required_version}\n\n"
                    if compat.message:
                        error_msg += f"{compat.message}\n\n"
                    if compat.download_url:
                        error_msg += f"Download the latest installer from:\n{compat.download_url}"
                    self.show_message("Installer Update Required", error_msg)
                return

            self.update_status(f"Connecting to {source.repo}...")
            self.update_progress(10)

            with tempfile.TemporaryDirectory() as temp_dir:
                archive_path = Path(temp_dir) / "archive.zip"

                download_attempt = [0]

                def progress_cb(current, total):
                    if current == 0 or (current > 0 and current <= 8192):
                        download_attempt[0] += 1
                    attempt = download_attempt[0]
                    retry_label = f" (attempt {attempt})" if attempt > 1 else ""
                    current_mb = current / (1024 * 1024)
                    if total > 0:
                        pct = 10 + (current * 40 // total)
                        self.update_progress(pct)
                        total_mb = total / (1024 * 1024)
                        self.update_status(f"Downloading{retry_label}... {current_mb:.1f} / {total_mb:.1f} MB")
                    else:
                        approx_mb = APPROXIMATE_ARCHIVE_SIZE / (1024 * 1024)
                        self.update_status(f"Downloading{retry_label}... {current_mb:.1f} of about {approx_mb:.0f} MB")

                from ..installer.downloader import APPROXIMATE_ARCHIVE_SIZE
                result = download_archive(source, archive_path, progress_cb)

                if not result.success:
                    self.show_message("Error", f"Download failed: {result.error}")
                    return

                self.update_status("Extracting files...")
                self.update_progress(50)

                def extract_cb(filename, current, total):
                    if total > 0:
                        pct = 50 + (current * 30 // total)
                        self.update_progress(pct)

                extract_result = extract_tools(archive_path, components, progress_callback=extract_cb)

                if not extract_result.success:
                    self.show_message("Error", f"Extraction failed: {extract_result.errors}")
                    return

                # Install Python dependencies required by extracted components
                self.update_status("Installing dependencies...")
                self.update_progress(82)
                from ..installer.dependencies import install_missing_dependencies
                dep_ok, dep_msg = install_missing_dependencies()
                if not dep_ok:
                    self.show_message("Warning", f"Some dependencies failed to install: {dep_msg}")

                # Apply patches based on selected option
                if self.apply_monkey_patch:
                    # Monkey patching - runtime hooks
                    self.update_status("Installing monkey patch hooks...")
                    self.update_progress(85)
                    from ..monkey_patches import install_hooks
                    hook_results = install_hooks()
                    success_count = sum(1 for v in hook_results.values() if v)
                    if success_count < len(hook_results):
                        self.show_message("Warning", f"Only {success_count}/{len(hook_results)} hooks installed")
                    self.installer_config.patches.method = "monkey"

                else:
                    # No patching selected
                    self.installer_config.patches.method = "none"

                # Apply ROM-less patches if checkbox is checked
                if self.apply_romless_patches_prop and "romless_patches" in components:
                    self.update_status("Applying ROM-less patches...")
                    self.update_progress(90)
                    romless_result = apply_romless_patches(self.installer_config)
                    if not romless_result.success:
                        self.show_message("Warning", f"ROM-less patch issues: {romless_result.errors}")

                # Configure export settings in host.yaml
                if self.configure_export:
                    preset = self.get_selected_export_preset()
                    self.update_status(f"Configuring export settings ({preset})...")
                    self.update_progress(95)
                    if configure_export_settings(preset=preset):
                        if preset == "minimal-spoilers":
                            self.update_status("Export settings configured (JSON export enabled)")
                    else:
                        self.show_message(
                            "Warning",
                            "Could not configure export settings in host.yaml.\n"
                            "You may need to run:\n"
                            "python scripts/setup/update_host_settings.py minimal-spoilers"
                        )

                self.update_progress(100)
                self.update_status("Installation complete!")

                # Get commit hash
                commit_hash = get_latest_commit_hash(source)

                # Update config
                from ..config import update_installation_info
                update_installation_info(self.installer_config, version, components, commit_hash)

                self.show_message(
                    "Success",
                    "JSON Tools installed successfully!\n\nComponents are ready to use."
                )

        except Exception as e:
            self.show_message("Error", f"Installation failed: {str(e)}")
        finally:
            self.is_working = False
            Clock.schedule_once(lambda dt: setattr(self.progress, 'value', 0))

    def do_uninstall(self, instance):
        """Uninstall JSON Tools."""
        if self.is_working:
            return

        self.is_working = True
        thread = threading.Thread(target=self._uninstall_thread)
        thread.daemon = True
        thread.start()

    def _uninstall_thread(self):
        """Uninstall logic."""
        try:
            self.update_status("Reverting ROM-less patches...")
            self.update_progress(20)
            revert_romless_patches(self.installer_config)

            self.update_status("Removing components...")
            self.update_progress(50)

            from ..installer.extractor import remove_component
            installed = list_installed_components()
            for comp in installed:
                remove_component(comp)
                self.update_progress(50 + (len(installed) * 10))

            # Uninstall monkey patch hooks
            try:
                from ..monkey_patches.hooks import uninstall_hooks
                uninstall_hooks()
            except Exception:
                pass

            from ..config import clear_installation
            clear_installation(self.installer_config)

            self.update_progress(100)
            self.update_status("Uninstall complete!")

            self.show_message("Success", "JSON Tools has been uninstalled.")

        except Exception as e:
            self.show_message("Error", f"Uninstall failed: {str(e)}")
        finally:
            self.is_working = False
            Clock.schedule_once(lambda dt: setattr(self.progress, 'value', 0))

    def do_revert(self, instance):
        """Revert patches only."""
        if self.is_working:
            return

        self.is_working = True

        def revert():
            try:
                errors = []

                self.update_status("Reverting ROM-less patches...")
                romless_result = revert_romless_patches(self.installer_config)
                if romless_result.errors:
                    errors.extend(romless_result.errors)

                if errors:
                    self.show_message("Warning", f"Some patches could not be reverted: {errors}")
                else:
                    self.show_message("Success", "Patches reverted successfully.")

                self.update_status("Ready")

            except Exception as e:
                self.show_message("Error", f"Revert failed: {str(e)}")
            finally:
                self.is_working = False

        thread = threading.Thread(target=revert)
        thread.daemon = True
        thread.start()


def run_installer_gui(*args):
    """Run the installer GUI."""
    app = InstallerApp()
    app.run()


if __name__ == "__main__":
    run_installer_gui()
