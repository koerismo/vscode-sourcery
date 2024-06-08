# Sourcery

## Features

- Sourcemod mounting
	- If enabled, Sourcery will mount the active game or mod when opened in a new workspace. This enables the `mod://` uri, which reads from the game's filesystem.
	- VPKs can be added to the workspace by right clicking them in the file explorer.
	- VTFs will show a basic image preview when opened.
- Model utilities
	- When a game is mounted, models will automatically update themselves when renamed or moved.
	- Models can be copied from mounted content into the current mod/game with the `Copy To Mod` command.
	- When a game is mounted, models can be compiled asynchronously when a QC is opened - without configuring studiomdl manually.
- Material utilities
	- When a game is mounted, links will appear on all textures in the currently-open vmt.
	- When a game is mounted, a basic shaded material preview can be opened through the menu.

## Known Issues

- <u>No settings function at this time.</u>
- VPKs will occasionally fail operations on first load. If a VPK appears empty or broken or a model fails to copy, try it again!
- Gameinfo glob (xyz/\*/) searchpaths will fail to load.
