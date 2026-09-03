const fragmentos = [
    './fragments/access.html',
    './fragments/dashboard.html',
    './fragments/reports.html',
    './fragments/admin-modals.html',
    './fragments/totem.html',
    './fragments/print.html'
];

async function carregarInterface() {
    const respostas = await Promise.all(fragmentos.map(async caminho => {
        const resposta = await fetch(caminho, { cache: 'no-cache' });
        if (!resposta.ok) throw new Error(`Não foi possível carregar ${caminho}.`);
        return resposta.text();
    }));

    const raiz = document.getElementById('application-fragments');
    raiz.innerHTML = respostas.join('\n');

    // As importações explícitas preservam a ordem dos módulos no navegador e
    // permitem que o build do Netlify entregue um único pacote, sem aguardar
    // downloads externos do Firebase durante a abertura do sistema.
    await import('./core.js');
    await import('./firebase.js');
    await import('./auth.js');
    await import('./clientes.js');
    await import('./marketing.js');
    await import('./totem.js');
    await import('./dashboard.js');
    await import('./relatorios.js');
}

try {
    await carregarInterface();
} catch (erro) {
    console.error('Falha ao iniciar a interface:', erro);
    document.getElementById('application-fragments').innerHTML =
        '<div class="app-load-error"><h1>Não foi possível abrir o sistema</h1><p>Atualize a página. Se o problema continuar, verifique a conexão.</p></div>';
}

