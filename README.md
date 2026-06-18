# Sourcery

### [READ KNOWN ISSUES BEFORE USING THIS EXTENSION](#known-issues)

## Features

- Game mounting
	- If enabled, Sourcery will mount the active game or mod when opened in a new workspace. This enables the `mod://` uri, which reads from the game's filesystem.
	- VPKs can be added to the workspace by right clicking them in the file explorer.
	- VTFs will show a basic image preview when opened.
- Model utilities
	- When a game is mounted, models will automatically update themselves when renamed or moved.
	- Assets can be copied from any mounted game into the current mod/game with the `Copy To Mod` command.
	- When a game is mounted, models can be compiled asynchronously when a QC is opened - without configuring studiomdl manually.
- Material utilities
	- VMT editing:
		- Autocompletes shader types
		- Autocompletes and validates properties, accounting for shader types.
		- Autocompletes material proxy properties
		- When a game is mounted, links will appear on all textures in the currently-open vmt.
	- Game materials can be quickly browsed with the multithreaded material/texture browser.
	- ~~Textures will automatically be converted when pasted into a VMT. If multiple are provided, they will be merged depending on the material context. (ex. metallic/roughness/AO textures will be merged when pasting after a `$mraotexture` key.)~~
		- Removed for now. Stay tuned!
	- Textures can be retargeted (changing their version) with a right-click action in the file tree.
- Detail utilities
	- When a game is mounted, detail props can be configured through the visual editor.
	- Detail files in the current workspace are autocompleted and linked in vmts.

## Known Issues

- The code quality of this project is abysmal. Fork at your own risk. If you choose to reuse code from this project, please give credit! This project is licensed under GPL-v3.
- The detail editor occasionally has issues with the mouse "sticking" in the UV editor. Clicking again should resolve it.
- The detail editor does not load game models. This is not a planned feature.
- The material preview has been disabled for the time being due to in-game innacuracy.
- On Windows, the model name updater may use incorrectly-formatted paths. 
- The model skin editor is nonfunctional at this time.
- ~~VPKs will occasionally fail operations on first load. If a VPK appears empty or broken or a model fails to copy, try it again!~~
- ~~When converting VTFs, the dxt-js library tends to leak memory. This leads to extraneous data being written to converted/retargeted files.~~
- ~~`mount.cfg` files will not contribute mounts to the project.~~

## Dependencies

- ~~This project relies on StefanH's Source Engine vscode extension to register the formats that sourcery supplies with autocompletion and syntax highlighting.~~
- ~~This project use's gkjohnson's `source-engine-model-loader` plugin for three.js. This is intended for the detail editor and model preview, neither of which are considered ready for integration as of v0.0.6.~~
- Some parsing code has been adapted from other projects. Wherever this is the case, a comment linking back to the original code will be present.
