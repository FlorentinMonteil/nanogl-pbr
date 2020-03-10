import Enum from './Enum';
import Flag from './Flag';
import LightType from './LightType';
import Chunk from './Chunk';
import { ShadowFiltering } from './ShadowFilteringEnum';
import dirPreCode from './glsl/templates/standard/directional-lights-pre.frag';
import spotPreCode from './glsl/templates/standard/spot-lights-pre.frag';
import pointPreCode from './glsl/templates/standard/point-lights-pre.frag';
import dirLightCode from './glsl/templates/standard/directional-light.frag';
import spotLightCode from './glsl/templates/standard/spot-light.frag';
import pointLightCode from './glsl/templates/standard/point-light.frag';
import shadPreCode from './glsl/templates/standard/shadow-maps-pre.frag';
import preLightCode from './glsl/templates/standard/pre-light-setup.frag';
import postLightCode from './glsl/templates/standard/post-light-setup.frag';
class StandardModel {
    constructor() {
        this._datas = {};
        this._dataList = [];
        this._setup = null;
        this.preLightsChunk = new PreLightsChunk();
        this.postLightsChunk = new PostLightsChunk();
        this.shadowChunk = new ShadowsChunk(this);
        this.shadowFilter = new Enum('shadowFilter', ShadowFiltering);
        this.iblShadowing = new Flag('iblShadowing', false);
        let d;
        d = new DirDatas();
        this._datas[LightType.DIRECTIONAL] = d;
        this._dataList.push(d);
        d = new SpotDatas();
        this._datas[LightType.SPOT] = d;
        this._dataList.push(d);
        d = new PointDatas();
        this._datas[LightType.POINT] = d;
        this._dataList.push(d);
    }
    getLightSetup() {
        return this._setup;
    }
    setLightSetup(ls) {
        this._setup = ls;
    }
    add(l) {
        var data = this._datas[l._type];
        data.addLight(l);
    }
    remove(l) {
        var data = this._datas[l._type];
        data.removeLight(l);
    }
    update() {
        this.shadowChunk.shadowCount = 0;
        for (var i = 0; i < this._dataList.length; i++) {
            this._dataList[i].update(this);
        }
        this.shadowChunk.check();
    }
    getChunks() {
        const res = [
            this.iblShadowing,
            this.shadowFilter,
            this.shadowChunk,
            this.preLightsChunk,
        ];
        for (var i = 0; i < this._dataList.length; i++) {
            res.push(this._dataList[i]);
        }
        res.push(this.postLightsChunk);
        return res;
    }
}
class PreLightsChunk extends Chunk {
    constructor() {
        super(true, false);
    }
    _genCode(slots) {
        const code = preLightCode(this);
        slots.add('lightsf', code);
    }
    _getHash() {
        return '0';
    }
}
class PostLightsChunk extends Chunk {
    constructor() {
        super(true, false);
    }
    _genCode(slots) {
        const code = postLightCode(this);
        slots.add('lightsf', code);
    }
    _getHash() {
        return '0';
    }
}
const MAX_SHADOWS = 4;
const AA = Math.PI / 4.0;
class ShadowsChunk extends Chunk {
    constructor(lightModel) {
        super(true, true);
        this.lightModel = lightModel;
        this.shadowCount = 0;
        this.genCount = 0;
        this._matrices = new Float32Array(MAX_SHADOWS * 16);
        this._texelBiasVector = new Float32Array(MAX_SHADOWS * 4);
        this._shadowmapSizes = new Float32Array(MAX_SHADOWS * 2);
        this._umatrices = null;
        this._utexelBiasVector = null;
        this._ushadowmapSizes = null;
    }
    _genCode(slots) {
        if (this.shadowCount > 0) {
            slots.add('pf', shadPreCode(this));
        }
    }
    addLight(light) {
        const i = this.shadowCount;
        const lightSetup = this.lightModel.getLightSetup();
        this.shadowCount++;
        this._matrices.set(light.getShadowProjection(lightSetup.bounds), i * 16);
        this._texelBiasVector.set(light.getTexelBiasVector(), i * 4);
        const s = light._shadowmapSize;
        this._shadowmapSizes[i * 2 + 0] = s;
        this._shadowmapSizes[i * 2 + 1] = 1.0 / s;
        if (i === 0) {
            var hasDepthTex = light.hasDepthShadowmap();
            lightSetup.depthFormat.set(hasDepthTex ? 'D_DEPTH' : 'D_RGB');
        }
        return i;
    }
    _getHash() {
        return '' + this.shadowCount;
    }
    check() {
        if (this.genCount !== this.shadowCount) {
            this.genCount = this.shadowCount;
            this._umatrices = new Float32Array(this._matrices.buffer, 0, this.shadowCount * 16);
            this._utexelBiasVector = new Float32Array(this._texelBiasVector.buffer, 0, this.shadowCount * 4);
            this._ushadowmapSizes = new Float32Array(this._shadowmapSizes.buffer, 0, this.shadowCount * 2);
            this.invalidateCode();
        }
        this._invalid = true;
    }
    setup(prg) {
        if (this.shadowCount > 0) {
            prg.uShadowMatrices(this._umatrices);
            prg.uShadowTexelBiasVector(this._utexelBiasVector);
            prg.uShadowMapSize(this._ushadowmapSizes);
            if (prg.uShadowKernelRotation !== undefined) {
                prg.uShadowKernelRotation(1.0 * Math.cos(AA), 1.0 * Math.sin(AA));
            }
            this._invalid = false;
        }
    }
}
class LightDatas extends Chunk {
    constructor() {
        super(true, true);
        this.type = LightType.UNKNOWN;
        this.lights = [];
        this.shadowIndices = [];
        this.preCodeTemplate = null;
    }
    addLight(l) {
        if (this.lights.indexOf(l) === -1) {
            this.lights.push(l);
            this.shadowIndices.push(-1);
            this.invalidateCode();
        }
    }
    removeLight(l) {
        const i = this.lights.indexOf(l);
        if (i > -1) {
            this.lights.splice(i, 1);
            this.shadowIndices.splice(i, 1);
            this.invalidateCode();
        }
    }
    _genCode(slots) {
        let code = this.preCodeTemplate({
            count: this.lights.length
        });
        slots.add('pf', code);
        code = '';
        for (var i = 0; i < this.lights.length; i++) {
            code += this.genCodePerLights(this.lights[i], i, this.shadowIndices[i]);
        }
        slots.add('lightsf', code);
    }
    _getHash() {
        let h = this.type + '' + this.lights.length;
        for (var i = 0; i < this.lights.length; i++) {
            if (this.lights[i]._castShadows) {
                h += i;
            }
        }
        return h;
    }
    setup(prg) {
        for (var i = 0; i < this.shadowIndices.length; i++) {
            var si = this.shadowIndices[i];
            if (si > -1) {
                var tex = this.lights[i].getShadowmap();
                prg['tShadowMap' + si](tex);
            }
        }
    }
}
class SpotDatas extends LightDatas {
    constructor() {
        super();
        this.type = LightType.SPOT;
        this._directions = null;
        this._colors = null;
        this._positions = null;
        this._spot = null;
        this._falloff = null;
        this.preCodeTemplate = spotPreCode;
    }
    genCodePerLights(light, index, shadowIndex) {
        var o = {
            index: index,
            shadowIndex: shadowIndex
        };
        return spotLightCode(o);
    }
    allocate(n) {
        if (this._colors === null || this._colors.length / 4 !== n) {
            this._directions = new Float32Array(n * 3);
            this._colors = new Float32Array(n * 4);
            this._positions = new Float32Array(n * 3);
            this._spot = new Float32Array(n * 2);
            this._falloff = new Float32Array(n * 3);
        }
    }
    update(model) {
        const lights = this.lights;
        this.allocate(lights.length);
        for (var i = 0; i < lights.length; i++) {
            var l = lights[i];
            this._directions.set(l._wdir, i * 3);
            this._colors.set(l._color, i * 4);
            this._positions.set(l._wposition, i * 3);
            this._spot.set(l._spotData, i * 2);
            this._falloff.set(l._falloffData, i * 3);
            this._colors[i * 4 + 3] = l.iblShadowing;
            if (l._castShadows) {
                var shIndex = model.shadowChunk.addLight(l);
                if (this.shadowIndices[i] !== shIndex) {
                    this.invalidateCode();
                }
                this.shadowIndices[i] = shIndex;
            }
            else {
                this.shadowIndices[i] = -1;
            }
        }
        this._invalid = true;
    }
    setup(prg) {
        if (this.lights.length > 0) {
            super.setup(prg);
            prg.uLSpotDirections(this._directions);
            prg.uLSpotColors(this._colors);
            prg.uLSpotPositions(this._positions);
            prg.uLSpotSpot(this._spot);
            prg.uLSpotFalloff(this._falloff);
            this._invalid = false;
        }
    }
}
class DirDatas extends LightDatas {
    constructor() {
        super();
        this.type = LightType.DIRECTIONAL;
        this._directions = null;
        this._colors = null;
        this.preCodeTemplate = dirPreCode;
    }
    genCodePerLights(light, index, shadowIndex) {
        var o = {
            index: index,
            shadowIndex: shadowIndex
        };
        return dirLightCode(o);
    }
    allocate(n) {
        if (this._colors === null || this._colors.length / 4 !== n) {
            this._directions = new Float32Array(n * 3);
            this._colors = new Float32Array(n * 4);
        }
    }
    update(model) {
        var lights = this.lights;
        this.allocate(lights.length);
        for (var i = 0; i < lights.length; i++) {
            var l = lights[i];
            this._directions.set(l._wdir, i * 3);
            this._colors.set(l._color, i * 4);
            this._colors[i * 4 + 3] = l.iblShadowing;
            if (l._castShadows) {
                var shIndex = model.shadowChunk.addLight(l);
                if (this.shadowIndices[i] !== shIndex) {
                    this.invalidateCode();
                }
                this.shadowIndices[i] = shIndex;
            }
            else {
                this.shadowIndices[i] = -1;
            }
        }
        this._invalid = true;
    }
    setup(prg) {
        if (this.lights.length > 0) {
            super.setup(prg);
            prg.uLDirDirections(this._directions);
            prg.uLDirColors(this._colors);
            this._invalid = false;
        }
    }
}
class PointDatas extends LightDatas {
    constructor() {
        super();
        this.type = LightType.POINT;
        this._colors = null;
        this._positions = null;
        this._falloff = null;
        this.preCodeTemplate = pointPreCode;
    }
    genCodePerLights(light, index, shadowIndex) {
        var o = {
            index: index,
            shadowIndex: shadowIndex
        };
        return pointLightCode(o);
    }
    allocate(n) {
        if (this._colors === null || this._colors.length / 3 !== n) {
            this._colors = new Float32Array(n * 3);
            this._positions = new Float32Array(n * 3);
            this._falloff = new Float32Array(n * 3);
        }
    }
    update(model) {
        const lights = this.lights;
        this.allocate(lights.length);
        for (var i = 0; i < lights.length; i++) {
            var l = lights[i];
            this._colors.set(l._color, i * 3);
            this._positions.set(l._wposition, i * 3);
            this._falloff.set(l._falloffData, i * 3);
            if (l._castShadows) {
                var shIndex = model.shadowChunk.addLight(l);
                if (this.shadowIndices[i] !== shIndex) {
                    this.invalidateCode();
                }
                this.shadowIndices[i] = shIndex;
            }
            else {
                this.shadowIndices[i] = -1;
            }
        }
        this._invalid = true;
    }
    setup(prg) {
        if (this.lights.length > 0) {
            super.setup(prg);
            prg.uLPointColors(this._colors);
            prg.uLPointPositions(this._positions);
            prg.uLPointFalloff(this._falloff);
            this._invalid = false;
        }
    }
}
export default StandardModel;