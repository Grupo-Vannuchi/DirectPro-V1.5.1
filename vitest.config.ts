import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Mesmo atalho "@/..." que o tsconfig usa
      "@": raiz,
      // O pacote `server-only` LANÇA quando importado fora de um Server
      // Component — é essa a função dele. Em teste, isso derrubaria qualquer
      // módulo do lib/. O próprio pacote traz um empty.js para ambientes que
      // não são o bundler do Next, mas o campo `exports` dele só publica ".",
      // então o subcaminho precisa ser resolvido como arquivo.
      "server-only": fileURLToPath(
        new URL("node_modules/server-only/empty.js", import.meta.url)
      ),
    },
  },
  test: {
    // Só funções puras: nada de banco, nada de rede, nada de DOM.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
