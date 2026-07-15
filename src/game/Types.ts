export interface InputState {
    dirX: number; // -1.0 to 1.0
    jump: boolean;
    punch: boolean;
    kick: boolean;
    block: boolean;
    dash: boolean;
    special: boolean;
}

export interface InputProvider {
    getInput(): InputState;
}

export type WeaponType = 'UNARMED' | 'KATANA' | 'STAFF';

export interface CharacterStats {
    maxHealth: number;
    moveSpeed: number;
    jumpForce: number;
    baseDamage: number;
}
