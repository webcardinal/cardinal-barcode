import { Config as StencilConfig } from '@stencil/core';

export interface CardinalConfig extends StencilConfig {
  readonly useBootstrap: boolean
}

export const config: CardinalConfig = {
  namespace: 'webcardinal',
  globalScript: './src/globals/index.ts',
  outputTargets: [
    {
      type: 'dist',
      dir: 'build/dist'
    }
  ],
  useBootstrap: true
}
