# Sourcery

### [READ KNOWN ISSUES BEFORE USING THIS EXTENSION](#known-issues)

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
	- Textures will automatically be converted when pasted into a VMT. If multiple are provided, they will be merged depending on the material context. (ex. metallic/roughness/AO textures will be merged when pasting after a `$mraotexture` key.)
- Detail utilities
	- When a game is mounted, detail props can be configured through the visual editor.
	- Detail files in the current workspace are autocompleted and linked in vmts.

## Known Issues

- The code quality of this project is abysmal. Fork at your own risk. If you choose to reuse code from this project, please give credit! This project is licensed under GPL-v3.
- The detail editor occasionally has issues with the mouse "sticking" in the UV editor. Clicking again should resolve it.
- The detail editor does not load game models.
- Strata-compressed Vtfs may fail to autogenerate due to a bug in the encoder. This has not been tested in vtf-js 0.9.x.
- In versions of vtf.js prior to 0.9.x, the dxt encoder used an extremely basic algorithm, resulting in blocky textures when converted. It has since been reverted to depend on dxt-js.
- The material preview has been completely disabled due to major inaccuracies on most shader setups.
- Model renaming may not function on windows.
- No Crowbar actions have been implemented - the setting is currently unused.
- VPKs will occasionally fail operations on first load. If a VPK appears empty or broken or a model fails to copy, try it again!
- `mount.cfg` files will not contribute mounts to the project.

## Depdendencies

- This project relies on StefanH's Source Engine vscode extension to register the formats that sourcery supplies with autocompletion and syntax highlighting.
- This project use's gkjohnson's `source-engine-model-loader` plugin for three.js. This is intended for the detail editor and model preview, neither of which are considered ready for integration as of v0.0.6.
- Some parsing code has been adapted from other projects. Wherever this is the case, a comment linking back to the original code will be present.
