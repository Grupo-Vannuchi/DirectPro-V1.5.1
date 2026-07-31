import { muted } from "../ui";

// Estado vazio da coluna da direita: aparece no desktop enquanto nenhuma
// conversa está aberta. No celular esta rota mostra só a lista, e esta tela nem
// chega a ser vista — quem cuida disso é o ColunaConversa.
export default function ConversasVazio() {
  return (
    <div className={`m-auto max-w-xs p-8 text-center text-sm ${muted}`}>
      Escolha uma conversa à esquerda para ler e responder.
    </div>
  );
}
