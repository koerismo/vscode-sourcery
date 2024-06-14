import { BSPRenderer, SkyboxRenderer, SourceFileSystem, SourceLoadContext, SourceRenderContext, SourceRenderer } from './noclip/SourceEngine/Main.js';
// import { EntityMaterialParameters, fillSceneParamsOnRenderInst } from './noclip/Materials.js';
import { SceneContext, SceneDesc } from './noclip/SceneBase.js';
// import { StudioModelInstance } from './noclip/SourceEngine/Studio.js';
import { GfxDevice } from './noclip/gfx/platform/GfxPlatform.js';
import { BSPFile } from './noclip/SourceEngine/BSPFile.js';
// import { GfxRenderInstManager } from './noclip/gfx/render/GfxRenderInstManager.js';
// import { SceneGfx } from './noclip/viewer.js';

export async function createScene(context: SceneContext, loadContext: SourceLoadContext, mapId: string, mapPath: string): Promise<SourceRenderer> {
    const filesystem = loadContext.filesystem;
    const renderContext = new SourceRenderContext(context.device, loadContext);
    const renderer = new SourceRenderer(context, renderContext);

    const bsp = await filesystem.fetchFileData(mapPath);
	const bspFile = new BSPFile(bsp, mapId, loadContext.bspFileVariant);

    if (bspFile.pakfile !== null)
        filesystem.addPakFile(bspFile.pakfile);

    if (bspFile.cubemaps[0] !== undefined)
        await renderContext.materialCache.bindLocalCubemap(bspFile.cubemaps[0]);

    const bspRenderer = new BSPRenderer(renderContext, bspFile);
    
	// Build skybox from worldname.
    const worldspawn = bspRenderer.getWorldSpawn();
    if (worldspawn.skyname)
        renderer.skyboxRenderer = new SkyboxRenderer(renderContext, worldspawn.skyname);

    renderer.bspRenderers.push(bspRenderer);
    return renderer;
}

export class HalfLife2SceneDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, context: SceneContext) {
        const filesystem = new SourceFileSystem();
        const loadContext = new SourceLoadContext(filesystem);
        return createScene(context, loadContext, this.id, `/maps/${this.id}.bsp`);
    }
}

export class ModelViewDesc implements SceneDesc {
    constructor(public id: string, public name: string = id) {
    }

    public async createScene(device: GfxDevice, sceneContext: SceneContext) {
        const filesystem = new SourceFileSystem();
        const loadContext = new SourceLoadContext(filesystem);

		const renderContext = new SourceRenderContext(device, loadContext);
		const renderer = new SourceRenderer(sceneContext, renderContext);
		
		// renderer.skyboxRenderer = new SkyboxRenderer(renderContext, 'sky_borealis01');
		// renderer.bspRenderers.push(new BSPRenderer())
		// renderer.modelViewRenderer = new ModelViewRenderer(renderContext, 'models/editor/camera.mdl');
		
		throw 'FINISH THIS CODE!!!!!';
        // this.registerEntityFactories(loadContext.entityFactoryRegistry);
        return createScene(sceneContext, loadContext, '', '');
    }
}