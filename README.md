# WebProductsV — Catálogo de Produtos

Catálogo on-line onde o dono da loja cadastra produtos num painel e os clientes montam um pedido
para análise (sem pagamento on-line). O pedido fica salvo no banco e pode ser enviado também pelo
WhatsApp ou por e-mail.

- **Front-end:** HTML, CSS e JavaScript puros (sem frameworks, sem build).
- **Back-end:** Node.js usando só módulos nativos (`node:http`, `node:sqlite`, `node:crypto`).
- **Zero dependências:** não precisa de `npm install`.

Arquitetura, comparação de stacks, esquema do banco e API: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

---

## Guia de execução

### 1. Pré-requisito

**Node.js 22.13 ou mais novo** (recomendado: Node 24 LTS). Confira no terminal:

```bash
node -v
```

### 2. (Opcional) Carregar produtos de exemplo

Cria 4 categorias, 9 subcategorias e 19 produtos fictícios (só roda se o banco estiver vazio):

```bash
node scripts/dados-exemplo.js
```

### 3. Iniciar o servidor

Dois cliques em **`iniciar-servidor.bat`** (Windows) ou, no terminal, dentro da pasta do projeto:

```bash
node server.js
```

| Endereço | O que é |
|---|---|
| http://localhost:5630/ | Catálogo (clientes) |
| http://localhost:5630/admin/ | Painel administrativo |

Para usar outra porta: `PORT=8080 node server.js` (no PowerShell: `$env:PORT=8080; node server.js`).

### 4. Primeiro acesso ao painel

Abra `/admin/`. Na primeira vez, aparece a tela **Primeiro acesso**: crie o administrador com
nome, e-mail e senha (mínimo de 8 caracteres). Essa tela some depois que existe um administrador.

Em seguida, vá em **Configurações** e preencha o nome da loja, o **WhatsApp** e o **e-mail** que
recebem os pedidos. Sem eles, os botões "Enviar pelo WhatsApp/e-mail" não aparecem para o cliente.

### 5. Roteiro de teste

1. **Painel › Categorias:** crie uma categoria e uma subcategoria.
2. **Painel › Produtos › Novo produto:** preencha os campos, arraste uma imagem (ou cole uma URL),
   crie uma categoria pelo botão **+** ao lado do campo e salve. Teste também editar e excluir.
3. Na tabela, clique nos títulos das colunas para **ordenar** e use a **busca**.
4. **Catálogo:** filtre pela sidebar (categoria → subcategoria), busque por nome, descrição ou
   código de barras e mude a ordenação.
5. Adicione produtos, abra **Meu pedido**, ajuste as quantidades, preencha seus dados e envie.
   Na tela de sucesso, teste os botões de WhatsApp, e-mail e "Copiar resumo".
6. **Painel › Pedidos:** abra o pedido, mude para **Aprovado** e confira que o estoque baixou.
   Mude para **Cancelado** e veja o estoque voltar.
7. Tente pedir mais unidades do que o estoque (ou um produto esgotado): o servidor recusa e o
   carrinho se ajusta.

### 6. Backup e reset

- Todos os dados ficam em `data/loja.db` e as imagens em `uploads/`. **Backup = copiar essas duas pastas**
  (com o servidor parado).
- Para começar do zero: pare o servidor e apague `data/` e o conteúdo de `uploads/`.
- Esqueceu a senha do admin? Pare o servidor, apague a tabela de usuários e abra `/admin/` para
  fazer o primeiro acesso de novo:

  ```bash
  node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('data/loja.db').exec('DELETE FROM usuarios')"
  ```

---

## Colocando no ar (produção)

1. Um servidor com Node 22.13+ (VPS de US$ 4–6/mês, Render, Railway, Fly.io com volume persistente).
2. Copie o projeto e rode `node server.js` como serviço (systemd, PM2 ou o serviço da plataforma).
3. Coloque um proxy com **HTTPS** na frente. Exemplo com Caddy (certificado automático):

   ```
   minhaloja.com.br {
     reverse_proxy localhost:5630
   }
   ```

4. Atrás do proxy, inicie com `TRUST_PROXY=1` para os limites por IP e o cookie `Secure`
   funcionarem corretamente.
5. Faça backup periódico de `data/` e `uploads/`.

## Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `5630` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface de rede (use `127.0.0.1` para aceitar só conexões locais) |
| `DB_PATH` | `data/loja.db` | Caminho do banco SQLite |
| `TRUST_PROXY` | (vazio) | `1` quando estiver atrás de Caddy/Nginx |

## Personalizando o visual

As cores ficam em variáveis no topo de [`public/css/base.css`](public/css/base.css)
(`--primaria`, `--destaque`, `--fundo`…), com versão para tema escuro logo abaixo. Para aplicar a
identidade visual da loja, troque esses tokens e o ícone `public/img/icone.svg`.
