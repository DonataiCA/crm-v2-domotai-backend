import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
    server: {
        fs: {
            // El test de paridad importa el catálogo del frontend, que vive fuera
            // de la raíz de este proyecto.
            allow: ['..'],
        },
    },
});
