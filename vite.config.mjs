import { defineConfig } from 'vite'
import { publicCatalogPlugin } from './build/publicCatalog.mjs'
export default defineConfig({plugins:[publicCatalogPlugin()]})
