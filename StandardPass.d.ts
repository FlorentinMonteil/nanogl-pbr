import Input from './Input';
import Flag from './Flag';
import { GammaModeEnum } from './GammaModeEnum';
import MaterialPass from './MaterialPass';
import Program from 'nanogl/program';
import Node from 'nanogl-node';
import Camera from 'nanogl-camera';
import LightSetup from './LightSetup';
import PbrInputs from './PbrInputs';
import { AlphaModeEnum } from './AlphaModeEnum';
import ShaderVersion from './ShaderVersion';
import ShaderPrecision from './ShaderPrecision';
export default class StandardPass extends MaterialPass {
    version: ShaderVersion;
    precision: ShaderPrecision;
    shaderid: Flag;
    alpha: Input;
    alphaFactor: Input;
    alphaCutoff: Input;
    emissive: Input;
    emissiveFactor: Input;
    normal: Input;
    normalScale: Input;
    occlusion: Input;
    occlusionStrength: Input;
    iGamma: Input;
    iExposure: Input;
    alphaMode: AlphaModeEnum;
    gammaMode: GammaModeEnum;
    doubleSided: Flag;
    perVertexIrrad: Flag;
    horizonFading: Flag;
    glossNearest: Flag;
    surface: PbrInputs;
    constructor(name?: string);
    setLightSetup(setup: LightSetup): void;
    prepare(prg: Program, node: Node, camera: Camera): void;
}
