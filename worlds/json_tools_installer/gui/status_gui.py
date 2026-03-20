"""
Kivy-based GUI for JSON Tools status checker.

Displays current installation status and configuration.
"""

import os
os.environ.setdefault("KIVY_NO_CONSOLELOG", "1")
os.environ.setdefault("KIVY_NO_FILELOG", "1")
os.environ.setdefault("KIVY_NO_ARGS", "1")

from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.scrollview import ScrollView
from kivy.uix.gridlayout import GridLayout

from ..config import load_config, save_config
from ..installer.version_detector import detect_ap_version, get_version_support_status
from ..installer.extractor import list_installed_components, COMPONENTS
from ..installer.romless_patcher import get_romless_patch_summary
from ..monkey_patches import get_installed_hooks, install_hooks, uninstall_hooks


class StatusApp(App):
    """Status checker application."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.title = "JSON Tools Status"

    def build(self):
        """Build the UI."""
        root = BoxLayout(orientation='vertical', padding=10, spacing=5)
        self._populate(root)
        return root

    def _populate(self, root):
        """Populate the root layout with all status content."""
        # Header
        header = Label(
            text='JSON Tools Status',
            size_hint_y=None,
            height=40,
            font_size=24,
        )
        root.add_widget(header)

        # Scrollable content
        scroll = ScrollView()
        content = GridLayout(cols=2, spacing=5, size_hint_y=None, padding=10)
        content.bind(minimum_height=content.setter('height'))

        # Load data
        config = load_config()
        version_info = detect_ap_version()
        installed = list_installed_components()
        patch_summary = get_romless_patch_summary(config)

        # Section: AP Version
        content.add_widget(Label(text='[b]Archipelago Version[/b]', markup=True, size_hint_y=None, height=30))
        content.add_widget(Label(text='', size_hint_y=None, height=30))

        content.add_widget(Label(text='Version:', size_hint_y=None, height=25))
        content.add_widget(Label(text=version_info.version_string, size_hint_y=None, height=25))

        content.add_widget(Label(text='Support:', size_hint_y=None, height=25))
        content.add_widget(Label(text=get_version_support_status(version_info), size_hint_y=None, height=25))

        # Section: Installation
        content.add_widget(Label(text='', size_hint_y=None, height=10))
        content.add_widget(Label(text='', size_hint_y=None, height=10))
        content.add_widget(Label(text='[b]Installation[/b]', markup=True, size_hint_y=None, height=30))
        content.add_widget(Label(text='', size_hint_y=None, height=30))

        if config.installation.installed_at:
            content.add_widget(Label(text='Status:', size_hint_y=None, height=25))
            content.add_widget(Label(text='[color=00ff00]Installed[/color]', markup=True, size_hint_y=None, height=25))

            content.add_widget(Label(text='Version:', size_hint_y=None, height=25))
            content.add_widget(Label(text=config.installation.version, size_hint_y=None, height=25))

            content.add_widget(Label(text='Repository:', size_hint_y=None, height=25))
            content.add_widget(Label(text=config.installation.source_repo or 'unknown', size_hint_y=None, height=25))

            content.add_widget(Label(text='Installed At:', size_hint_y=None, height=25))
            content.add_widget(Label(text=config.installation.installed_at[:19], size_hint_y=None, height=25))
        elif installed:
            content.add_widget(Label(text='Status:', size_hint_y=None, height=25))
            content.add_widget(Label(text='[color=00ff00]Present[/color] (from repository)', markup=True, size_hint_y=None, height=25))
        else:
            content.add_widget(Label(text='Status:', size_hint_y=None, height=25))
            content.add_widget(Label(text='Not installed', size_hint_y=None, height=25))

        # Section: Monkey Patches
        content.add_widget(Label(text='', size_hint_y=None, height=10))
        content.add_widget(Label(text='', size_hint_y=None, height=10))
        content.add_widget(Label(text='[b]Monkey Patches[/b]', markup=True, size_hint_y=None, height=30))
        content.add_widget(Label(text='', size_hint_y=None, height=30))

        content.add_widget(Label(text='Config:', size_hint_y=None, height=25))
        config_method = config.patches.method
        if config_method == "monkey":
            config_text = '[color=00ff00]Enabled[/color] (auto-install on startup)'
        else:
            config_text = 'Disabled'
        content.add_widget(Label(text=config_text, markup=True, size_hint_y=None, height=25))

        content.add_widget(Label(text='Runtime:', size_hint_y=None, height=25))
        active_hooks = get_installed_hooks()
        if active_hooks:
            runtime_text = f'[color=00ff00]Active[/color] ({len(active_hooks)} hooks)'
        else:
            runtime_text = 'Inactive (no hooks installed)'
        content.add_widget(Label(text=runtime_text, markup=True, size_hint_y=None, height=25))

        if active_hooks:
            for hook_name in active_hooks:
                content.add_widget(Label(text=f'  {hook_name}:', size_hint_y=None, height=25))
                content.add_widget(Label(
                    text='[color=00ff00]Installed[/color]', markup=True, size_hint_y=None, height=25
                ))

        # Section: Components
        content.add_widget(Label(text='', size_hint_y=None, height=10))
        content.add_widget(Label(text='', size_hint_y=None, height=10))
        content.add_widget(Label(text='[b]Components[/b]', markup=True, size_hint_y=None, height=30))
        content.add_widget(Label(text='', size_hint_y=None, height=30))

        for name, comp in COMPONENTS.items():
            is_installed = name in installed
            status = '[color=00ff00]Installed[/color]' if is_installed else '[color=ff0000]Not installed[/color]'
            content.add_widget(Label(text=comp.display_name, size_hint_y=None, height=25))
            content.add_widget(Label(text=status, markup=True, size_hint_y=None, height=25))

        # Section: ROM-less Patches
        content.add_widget(Label(text='', size_hint_y=None, height=10))
        content.add_widget(Label(text='', size_hint_y=None, height=10))
        content.add_widget(Label(text='[b]ROM-less Patches[/b]', markup=True, size_hint_y=None, height=30))
        content.add_widget(Label(text='', size_hint_y=None, height=30))

        content.add_widget(Label(text='Worlds Patched:', size_hint_y=None, height=25))
        content.add_widget(Label(
            text=f"{patch_summary['patched_count']}/{patch_summary['available_worlds']}",
            size_hint_y=None, height=25
        ))

        content.add_widget(Label(text='Infrastructure:', size_hint_y=None, height=25))
        content.add_widget(Label(
            text=f"{patch_summary['infrastructure_patched']}/{patch_summary['infrastructure_files']}",
            size_hint_y=None, height=25
        ))

        for world_name, status in patch_summary['worlds'].items():
            patched = '[color=00ff00]Patched[/color]' if status.is_patched else 'Original'
            backup = ' (backup)' if status.has_backup else ''
            content.add_widget(Label(text=f'  {world_name}:', size_hint_y=None, height=25))
            content.add_widget(Label(text=f'{patched}{backup}', markup=True, size_hint_y=None, height=25))

        for infra_key, status in patch_summary['infrastructure'].items():
            label = infra_key.replace('infra:', '')
            patched = '[color=00ff00]Installed[/color]' if status.is_patched else 'Not installed'
            content.add_widget(Label(text=f'  {label}:', size_hint_y=None, height=25))
            content.add_widget(Label(text=patched, markup=True, size_hint_y=None, height=25))

        scroll.add_widget(content)
        root.add_widget(scroll)

        # Buttons
        button_box = BoxLayout(size_hint_y=None, height=50, spacing=10)

        # Monkey patch toggle button
        active_hooks = get_installed_hooks()
        if active_hooks:
            mp_btn = Button(text='Disable Monkey Patches')
            mp_btn.bind(on_press=self.disable_monkey_patches)
        else:
            mp_btn = Button(text='Enable Monkey Patches')
            mp_btn.bind(on_press=self.enable_monkey_patches)
        button_box.add_widget(mp_btn)

        refresh_btn = Button(text='Refresh')
        refresh_btn.bind(on_press=self.do_refresh)
        button_box.add_widget(refresh_btn)

        close_btn = Button(text='Close')
        close_btn.bind(on_press=self.stop)
        button_box.add_widget(close_btn)

        root.add_widget(button_box)

    def enable_monkey_patches(self, instance):
        """Enable monkey patches and update config."""
        config = load_config()
        config.patches.method = "monkey"
        save_config(config)
        install_hooks()
        self.do_refresh(instance)

    def disable_monkey_patches(self, instance):
        """Disable monkey patches and update config."""
        config = load_config()
        config.patches.method = "none"
        save_config(config)
        uninstall_hooks()
        self.do_refresh(instance)

    def do_refresh(self, instance):
        """Refresh the status display."""
        self.root.clear_widgets()
        self._populate(self.root)


def run_status_gui(*args):
    """Run the status GUI."""
    app = StatusApp()
    app.run()


if __name__ == "__main__":
    run_status_gui()
