import { Config as StencilConfig } from '@stencil/core';

export interface CardinalConfig extends StencilConfig {
  readonly useBootstrap: boolean
}

export const config: CardinalConfig = {
  namespace: 'cardinal',
  globalScript: './src/globals/index.ts',
  outputTargets: [
    {
      type: 'dist',
      dir: 'build/dist'
    },
    {
      type: 'dist-custom-elements-bundle',
      dir: 'build/elements-bundle'
    },
    {
      type: 'www',
      dir: 'build/www',
      serviceWorker: null
    },
    {
      type: 'docs-readme'
    }
  ],
  useBootstrap: true
}
