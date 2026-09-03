const fragmentos = [
    './fragments/access.html',
    './fragments/dashboard.html',
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

    for (const modulo of [
        './core.js', './firebase.js', './auth.js', './clientes.js',
        './marketing.js', './totem.js', './dashboard.js'
    ]) {
        await import(modulo);
    }
}

try {
    await carregarInterface();
} catch (erro) {
    console.error('Falha ao iniciar a interface:', erro);
    document.getElementById('application-fragments').innerHTML =
        '<div class="app-load-error"><h1>Não foi possível abrir o sistema</h1><p>Atualize a página. Se o problema continuar, verifique a conexão.</p></div>';
}


