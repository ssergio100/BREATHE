# Breathe: Integração com a API do GitLab

Este documento detalha o comportamento do componente **GitRebuilder** no Breathe em relação à API do GitLab, especificamente durante a criação e mesclagem de Merge Requests.

## Desafios Técnicos e Soluções

A integração de Mesclagem de Branches em Massa do GitLab pelo Breathe exige atenção a três cenários específicos e conhecidos da API do GitLab:

### 1. Concorrência e Verificações Assíncronas (HTTP 405)
**Problema:** Ao criar um Merge Request (`POST /projects/:id/merge_requests`), o GitLab não verifica os conflitos imediatamente de forma bloqueante. Em vez disso, envia a verificação para uma fila em background e inicializa o `merge_status` do MR como `checking`. Se o sistema client tentar solicitar o Merge (`PUT /merge`) imediatamente a seguir, a API rejeitará a requisição com o código de erro HTTP `405 Method Not Allowed`, pois o MR não concluiu os testes para saber se *pode* ser mesclado.
**Solução (Polling de Estado):** O Breathe agora executa um Polling (consulta repetida com delay) contra o endpoint `GET /projects/:id/merge_requests/:iid` após instanciar o MR. Ele repete as buscas a cada 1.5s até que o `merge_status` mude para estados definidos como `can_be_merged` ou `cannot_be_merged`.

### 2. Tratamento de Merge Requests Abertos
**Problema:** Quando há falha e o usuário clica em mesclar repetidas vezes, um Merge Request idêntico já pode estar pendente/aberto no sistema, e o GitLab retorna `409 Conflict`. Inicialmente, o sistema utilizava Regex na mensagem de erro textual (`"Already exists: !123"`) para fisgar o número do ID do Merge e continuar de onde parou, o que era suscetível a erros de versão de string ou tradução.
**Solução:** O Breathe intercepta o erro 409 (ou literais que contenham "already exists") e automaticamente consulta os Merges abertos via API oficial de listagem: `GET /projects/:id/merge_requests?source_branch=X&target_branch=Y&state=opened`, extraindo o número `iid` diretamente e com total segurança nativa.

### 3. Merges que não contêm Mudanças / Comportamentos Específicos
**Problema:** Tentar criar um Merge de uma branch fonte (`source`) para uma de destino (`target`) sendo que ambas já possuem os mesmos *commits*, gerava comportamentos mistos e opacos dependendo da versão do GitLab, mas predominantemente levantava `changes_count === 0` ou `HTTP 400 branches are not diverging`.
**Solução:** Pela API detalhada que puxa o Estado (`GET /merge_requests/:iid`), verificamos a variável `detailed_merge_status` por `"no_changes"`, ou validamos se a contagem de diferenças (`changes_count`) é igual a `0`. Assim que é identificado, a UI recebe imediatamente a flag informativa sem precisar de regex nos logs de erro.

## Endpoints Chave

O sistema consome prioritariamente:
- `GET /projects/:id/repository/branches` - Listagem e Validação.
- `POST /projects/:id/merge_requests` - Criação de novo MR de integração.
- `GET /projects/:id/merge_requests/:iid` - Auditoria de Pipeline e Checagem de Conflitos.
- `PUT /projects/:id/merge_requests/:iid/merge` - Efetivação do Commit de Merge final.

---
**Nota de Desenvolvimento:** Por conta do padrão estrito de proteção ("Proteção Absoluta da Master"), a configuração primária recusa requisições cujo alvo de MR seja a variável salva em `branchMaster`. Nenhuma rotina assíncrona ou PUT subverte a trava local dessa variável.
