import { InputProvider, InputState } from './Types';

export class MobileInput implements InputProvider {
    public state: InputState = { dirX: 0, jump: false, punch: false, kick: false, block: false, dash: false, special: false };
    
    getInput(): InputState {
        return { ...this.state };
    }
}

export class KeyboardInput implements InputProvider {
    private keys: { [key: string]: boolean } = {};
    private keydownHandler = (e: KeyboardEvent) => this.keys[e.code] = true;
    private keyupHandler = (e: KeyboardEvent) => this.keys[e.code] = false;
    
    constructor() {
        window.addEventListener('keydown', this.keydownHandler);
        window.addEventListener('keyup', this.keyupHandler);
    }
    
    destroy() {
        window.removeEventListener('keydown', this.keydownHandler);
        window.removeEventListener('keyup', this.keyupHandler);
    }
    
    getInput(): InputState {
        let dirX = 0;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) dirX = -1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) dirX = 1;
        
        return {
            dirX,
            jump: !!(this.keys['ArrowUp'] || this.keys['KeyW']),
            punch: !!this.keys['KeyJ'],
            kick: !!this.keys['KeyK'],
            block: !!this.keys['KeyL'],
            dash: !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'],
            special: !!this.keys['KeyI'],
        };
    }
}
