export type Landmark = { x: number; y: number; z: number }; // normalized [0,1], top-left origin
export type Handedness = 'Left' | 'Right';
export type Corner = { x: number; y: number }; // screen/canvas space (CSS px), top-left origin
export type Corners = [Corner, Corner, Corner, Corner]; // ordered: LT, LI, RI, RT
