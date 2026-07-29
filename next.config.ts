import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // A página deixou de ser loja (com preço e checkout) e virou vitrine dos
      // produtos da casa, então a rota acompanhou o nome. Ela esteve no menu
      // como "Loja" por um bom tempo, e link salvo de cliente não deve virar
      // 404.
      { source: "/loja", destination: "/produtos", permanent: true },
    ];
  },
};

export default nextConfig;
