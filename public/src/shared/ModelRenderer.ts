import { SourceFileSystem, SourceLoadContext, SourceRenderContext, SourceRenderer } from './NoclipPolyfill.js';
import { EntityMaterialParameters } from './noclip/Materials.js';
import { SceneContext, SceneDesc } from './noclip/SceneBase.js';
import { StudioModelInstance } from './noclip/Studio.js';
import { GfxDevice } from './noclip/gfx/platform/GfxPlatform.js';
import { GfxRenderInstManager } from './noclip/gfx/render/GfxRenderInstManager.js';
import { SceneGfx } from './noclip/viewer.js';

export class ModelViewRenderer {
	modelStudio?: StudioModelInstance;
	params: EntityMaterialParameters = new EntityMaterialParameters();
	skin: number = 0;

	seqindex: number = 0;
	seqtime: number = 0;
	
	constructor(renderContext: SourceRenderContext, private modelname: string) {
		this.bindModel(renderContext);
	}

	private async bindModel(renderContext: SourceRenderContext) {
		const modelData = await renderContext.studioModelCache.fetchStudioModelData(this.modelname, true);
		if (modelData.bodyPartData.length) {
			this.modelStudio = new StudioModelInstance(renderContext, modelData,  this.params);
			this.modelStudio.setSkin(renderContext, this.skin);
		}
	}

	prepareToRender(renderContext: SourceRenderContext, renderInstManager: GfxRenderInstManager) {
		if (!this.modelStudio) return;
		this.modelStudio.setupPoseFromSequence(this.seqindex, this.seqtime);
		this.modelStudio.prepareToRender(renderContext, renderInstManager);
	}

	movement(renderContext: SourceRenderContext) {
		this.modelStudio?.movement(renderContext);
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
		
		const modelRenderer = new ModelViewRenderer(renderContext, 'models/error.mdl');
		renderer.modelViewRenderer = modelRenderer;
		
        // this.registerEntityFactories(loadContext.entityFactoryRegistry);
        return renderer;
    }
}