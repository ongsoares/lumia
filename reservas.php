<?php
/**
 * ============================================================
 * reservas.php — Lumia Park Reservas de Festas
 * ============================================================
 * O que faz:
 *   Recebe os dados do popup de reserva (reservas.js) via POST
 *   (JSON), valida tudo outra vez no servidor (nunca confiar só
 *   na validação do frontend) — incluindo se o dia da semana
 *   está aberto, se o horário escolhido cabe na janela de
 *   funcionamento desse dia sem cruzar o almoço, e se a duração
 *   bate certo com o pacote — recalcula o valor estimado, e
 *   grava na tabela `reservation_requests` da base de dados
 *   MySQL da amen.pt.
 *
 * Como configurar:
 *   1. Corre primeiro o reservation_requests_schema.sql na tua
 *      base de dados (phpMyAdmin da amen.pt).
 *   2. As credenciais abaixo (DB_HOST, DB_NAME, DB_USER, DB_PASS)
 *      são as mesmas já usadas em subscribe.php / admin.php.
 *   3. Coloca este ficheiro na raiz do site (mesma pasta do
 *      index.html), para que o fetch('/reservas.php') do popup
 *      funcione.
 * ============================================================
 */

// ---------- CONFIGURAÇÃO (mesmas credenciais de subscribe.php / admin.php) ----------
define('DB_HOST', '127.0.0.1');           // TCP em vez de socket — evita erro SQLSTATE[HY000] [2002]
define('DB_NAME', 'lumiap_lumiapark');    // AJUSTAR
define('DB_USER', 'lumiap_lumia');        // AJUSTAR
define('DB_PASS', 'lumia2026');           // AJUSTAR
// ------------------------------------------------------------

header('Content-Type: application/json; charset=utf-8');

// Só aceita POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método não permitido.']);
    exit;
}

// Lê o corpo JSON
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Pedido inválido.']);
    exit;
}

// ---------- Tabela de pacotes — fonte de verdade no backend ----------
// Espelha as opções do <select id="lp-rv-pacote"> em index.html.
// 'fixo' > 0 significa preço fixo (não multiplica pelo nº de crianças) — caso do Lumia Moon.
// 'duracao' está em minutos (Playground + Sala de Festa, e no caso do Moon + Atividade Extra).
$PACOTES = [
    'school'   => ['nome' => 'Lumia School Party', 'preco' => 16.90, 'min' => 12, 'max' => null, 'fixo' => 0,      'duracao' => 120],
    'star'     => ['nome' => 'Lumia Star',         'preco' => 19.90, 'min' => 12, 'max' => null, 'fixo' => 0,      'duracao' => 90],
    'galaxy'   => ['nome' => 'Lumia Galaxy',       'preco' => 23.90, 'min' => 12, 'max' => null, 'fixo' => 0,      'duracao' => 120],
    'universe' => ['nome' => 'Lumia Universe',     'preco' => 31.90, 'min' => 12, 'max' => null, 'fixo' => 0,      'duracao' => 180],
    'moon'     => ['nome' => 'Lumia Moon',         'preco' => 0,     'min' => 1,  'max' => 8,    'fixo' => 250.00, 'duracao' => 120],
];

// ---------- Atividades extra válidas (só aplicável ao pacote Lumia Moon) ----------
$ATIVIDADES_EXTRA = [
    'karaoke' => 'Karaokê',
    'realidade_virtual' => 'Realidade Virtual',
];

/**
 * ============================================================
 * REGRAS DE FUNCIONAMENTO DO PARQUE
 * dayOfWeek: 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta,
 *            5=Sexta, 6=Sábado — igual ao formato de (int)date('w').
 * Estas mesmas regras estão replicadas em reservas.js, para que
 * o frontend só ofereça horários que o backend também aceita.
 * ============================================================
 */
$REGRAS_DIA = [
    0 => ['aberto' => true,  'abre' => '10:00', 'fecha' => '20:00'], // Domingo
    1 => ['aberto' => false],                                        // Segunda — encerrado
    2 => ['aberto' => false],                                        // Terça — encerrado
    3 => ['aberto' => true,  'abre' => '15:00', 'fecha' => '20:00'], // Quarta
    4 => ['aberto' => true,  'abre' => '15:00', 'fecha' => '20:00'], // Quinta
    5 => ['aberto' => true,  'abre' => '10:00', 'fecha' => '20:00'], // Sexta
    6 => ['aberto' => true,  'abre' => '10:00', 'fecha' => '20:00'], // Sábado
];
define('ALMOCO_INICIO', '13:00');
define('ALMOCO_FIM', '14:00');
define('INTERVALO_SLOTS_MIN', 30); // horas de início possíveis, de 30 em 30 minutos

function horaParaMinutos(string $hhmm): int {
    [$h, $m] = array_map('intval', explode(':', $hhmm));
    return $h * 60 + $m;
}
function minutosParaHora(int $min): string {
    return sprintf('%02d:%02d', intdiv($min, 60), $min % 60);
}

/**
 * Gera a lista de horários {inicio, fim} possíveis para um dia da semana
 * e uma duração de festa (minutos), respeitando a janela de abertura e
 * excluindo qualquer festa que colida com o intervalo de almoço.
 * Espelha exatamente a função gerarHorariosDisponiveis() do reservas.js.
 */
function gerarHorariosDisponiveis(array $regrasDia, int $dayOfWeek, int $duracaoMin): array {
    $regra = $regrasDia[$dayOfWeek] ?? null;
    if (!$regra || !$regra['aberto']) return [];

    $abreMin = horaParaMinutos($regra['abre']);
    $fechaMin = horaParaMinutos($regra['fecha']);
    $almocoInicioMin = horaParaMinutos(ALMOCO_INICIO);
    $almocoFimMin = horaParaMinutos(ALMOCO_FIM);

    $slots = [];
    for ($inicio = $abreMin; $inicio + $duracaoMin <= $fechaMin; $inicio += INTERVALO_SLOTS_MIN) {
        $fim = $inicio + $duracaoMin;
        $colideComAlmoco = $inicio < $almocoFimMin && $fim > $almocoInicioMin;
        if ($colideComAlmoco) continue;
        $slots[] = minutosParaHora($inicio) . ' - ' . minutosParaHora($fim);
    }
    return $slots;
}

// ---------- Recolha e limpeza dos campos ----------
$pacoteChave           = isset($input['pacote']) ? trim($input['pacote']) : '';
$dataFesta             = isset($input['data_festa']) ? trim($input['data_festa']) : '';
$horasFesta            = isset($input['horas_festa']) ? trim($input['horas_festa']) : '';
$numeroCriancas        = isset($input['numero_criancas']) ? (int) $input['numero_criancas'] : 0;
$valorEstimadoRecebido = isset($input['valor_estimado']) ? (float) $input['valor_estimado'] : 0;
$atividadeExtra        = isset($input['atividade_extra']) ? trim($input['atividade_extra']) : '';

$anivNome   = isset($input['aniversariante_nome']) ? trim($input['aniversariante_nome']) : '';
$anivIdade  = isset($input['aniversariante_idade']) ? (int) $input['aniversariante_idade'] : -1;
$anivNasc   = isset($input['aniversariante_nascimento']) ? trim($input['aniversariante_nascimento']) : '';

$respNome  = isset($input['responsavel_nome']) ? trim($input['responsavel_nome']) : '';
$telefone  = isset($input['telefone']) ? trim($input['telefone']) : '';
$email     = isset($input['email']) ? trim($input['email']) : '';
$nif       = isset($input['nif']) ? trim($input['nif']) : '';
$observacoes = isset($input['observacoes']) ? trim($input['observacoes']) : '';

// ---------- Validação: pacote ----------
if ($pacoteChave === '' || !isset($PACOTES[$pacoteChave])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Pacote inválido.']);
    exit;
}
$pacote = $PACOTES[$pacoteChave];

// ---------- Validação: data da festa ----------
$dataFestaObj = DateTime::createFromFormat('Y-m-d', $dataFesta);
if (!$dataFestaObj || $dataFestaObj->format('Y-m-d') !== $dataFesta) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Data da festa inválida.']);
    exit;
}
$dataAbertura = new DateTime('2026-09-12');
if ($dataFestaObj < $dataAbertura) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'As reservas só estão disponíveis a partir de 12 de setembro de 2026, data de abertura do Lumia Park.']);
    exit;
}

// ---------- Validação: dia da semana está aberto ----------
$diaSemana = (int) $dataFestaObj->format('w'); // 0=Domingo ... 6=Sábado
$regraDia = $REGRAS_DIA[$diaSemana];
if (!$regraDia['aberto']) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'O Lumia Park está encerrado às segundas e terças-feiras. Escolhe outra data.']);
    exit;
}

// ---------- Validação: horário da festa (tem de ser exatamente um dos slots válidos) ----------
$horariosValidos = gerarHorariosDisponiveis($REGRAS_DIA, $diaSemana, $pacote['duracao']);
if ($horasFesta === '' || !in_array($horasFesta, $horariosValidos, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'O horário escolhido não é válido para este pacote e esta data. Verifica os horários de funcionamento e o intervalo de almoço (13:00–14:00).']);
    exit;
}

// ---------- Validação: número de crianças (respeitando min/max do pacote) ----------
if ($numeroCriancas < 1) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Indica o número de crianças.']);
    exit;
}
if ($numeroCriancas < $pacote['min']) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'O pacote ' . $pacote['nome'] . ' exige um mínimo de ' . $pacote['min'] . ' crianças.']);
    exit;
}
if ($pacote['max'] !== null && $numeroCriancas > $pacote['max']) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'O pacote ' . $pacote['nome'] . ' aceita no máximo ' . $pacote['max'] . ' crianças.']);
    exit;
}

// ---------- Validação: atividade extra (obrigatória apenas no pacote Lumia Moon) ----------
if ($pacoteChave === 'moon') {
    if ($atividadeExtra === '' || !isset($ATIVIDADES_EXTRA[$atividadeExtra])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Escolhe a atividade extra do pacote Lumia Moon (Karaokê ou Realidade Virtual).']);
        exit;
    }
} else {
    $atividadeExtra = null; // não aplicável a outros pacotes — nunca gravar lixo vindo do frontend
}

// ---------- Validação: aniversariante ----------
if ($anivNome === '' || mb_strlen($anivNome) > 150) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Indica o nome do aniversariante.']);
    exit;
}
if ($anivIdade < 0 || $anivIdade > 17) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Idade do aniversariante inválida.']);
    exit;
}
$anivNascObj = DateTime::createFromFormat('Y-m-d', $anivNasc);
if (!$anivNascObj || $anivNascObj->format('Y-m-d') !== $anivNasc) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Data de nascimento do aniversariante inválida.']);
    exit;
}
if ($anivNascObj > $hoje) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'A data de nascimento não pode ser no futuro.']);
    exit;
}

// ---------- Validação: responsável / contacto ----------
if ($respNome === '' || mb_strlen($respNome) > 150) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Indica o nome completo do responsável.']);
    exit;
}
$telefoneDigitos = preg_replace('/\D/', '', $telefone);
if (mb_strlen($telefoneDigitos) < 9 || mb_strlen($telefone) > 20) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Número de telefone inválido.']);
    exit;
}
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email inválido.']);
    exit;
}
// NIF é opcional, mas se for preenchido tem de ter 9 dígitos
if ($nif !== '' && !preg_match('/^\d{9}$/', $nif)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'NIF inválido (deve ter 9 dígitos) ou deixa em branco.']);
    exit;
}
if (mb_strlen($observacoes) > 2000) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Observações demasiado longas.']);
    exit;
}

// ---------- Recalcular o valor no servidor — nunca confiar no valor vindo do frontend ----------
if ($pacote['fixo'] > 0) {
    $valorEstimado = $pacote['fixo'];
} else {
    $valorEstimado = round($pacote['preco'] * $numeroCriancas, 2);
}

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $stmt = $pdo->prepare(
        'INSERT INTO reservation_requests
            (pacote, pacote_nome, data_festa, horas_festa, numero_criancas, valor_estimado, atividade_extra,
             aniversariante_nome, aniversariante_idade, aniversariante_nascimento,
             responsavel_nome, telefone, email, nif, observacoes, estado, criado_em)
         VALUES
            (:pacote, :pacote_nome, :data_festa, :horas_festa, :numero_criancas, :valor_estimado, :atividade_extra,
             :aniversariante_nome, :aniversariante_idade, :aniversariante_nascimento,
             :responsavel_nome, :telefone, :email, :nif, :observacoes, "pendente", NOW())'
    );
    $stmt->execute([
        ':pacote' => $pacoteChave,
        ':pacote_nome' => $pacote['nome'],
        ':data_festa' => $dataFesta,
        ':horas_festa' => $horasFesta,
        ':numero_criancas' => $numeroCriancas,
        ':valor_estimado' => $valorEstimado,
        ':atividade_extra' => $atividadeExtra,
        ':aniversariante_nome' => $anivNome,
        ':aniversariante_idade' => $anivIdade,
        ':aniversariante_nascimento' => $anivNasc,
        ':responsavel_nome' => $respNome,
        ':telefone' => $telefone,
        ':email' => $email,
        ':nif' => $nif !== '' ? $nif : null,
        ':observacoes' => $observacoes !== '' ? $observacoes : null,
    ]);

    // ---------- ENVIO DE NOTIFICAÇÃO POR E-MAIL ----------
    $to      = 'geral@lumiapark.pt'; // ALTERA PARA O TEU E-MAIL
    $subject = "🎉 Nova Reserva: " . $anivNome . " (" . $dataFesta . ")";

    $valorFormatado = number_format($valorEstimado, 2, ',', '.') . ' €';
    $obsTxt = $observacoes !== '' ? htmlspecialchars($observacoes) : '<em>Nenhuma</em>';
    $nifTxt = $nif !== '' ? htmlspecialchars($nif) : '<em>Não indicado</em>';

    $message = "
    <html>
    <head><title>Nova Reserva Recebida</title></head>
    <body style='font-family: Arial, sans-serif; color: #100a1c; line-height: 1.5;'>
        <h2 style='color: #C64FD9;'>Novo Pedido de Reserva - Lumia Park</h2>
        <p><strong>Aniversariante:</strong> " . htmlspecialchars($anivNome) . " (" . $anivIdade . " anos)</p>
        <p><strong>Data & Horário:</strong> " . htmlspecialchars($dataFesta) . " às " . htmlspecialchars($horasFesta) . "</p>
        <p><strong>Pacote Escolhido:</strong> " . htmlspecialchars($pacote['nome']) . "</p>
        <p><strong>Nº de Crianças:</strong> " . $numeroCriancas . "</p>
        <p><strong>Valor Estimado:</strong> " . $valorFormatado . "</p>
        <hr style='border: 0; border-top: 1px solid #ccc;'>
        <h3>Dados do Responsável:</h3>
        <p><strong>Nome:</strong> " . htmlspecialchars($respNome) . "</p>
        <p><strong>Telefone:</strong> " . htmlspecialchars($telefone) . "</p>
        <p><strong>E-mail:</strong> " . htmlspecialchars($email) . "</p>
        <p><strong>NIF:</strong> " . $nifTxt . "</p>
        <p><strong>Observações:</strong> " . $obsTxt . "</p>
    </body>
    </html>
    ";

    $headers   = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-type: text/html; charset=utf-8';
    $headers[] = 'From: Lumia Park <geral@lumiapark.pt>';
    $headers[] = 'Reply-To: ' . $email;

    @mail($to, $subject, $message, implode("\r\n", $headers));

    echo json_encode(['success' => true, 'message' => 'Pedido de reserva enviado com sucesso.']);

} catch (PDOException $e) {
    http_response_code(500);
    // ⚠️ TEMPORÁRIO PARA DEPURAR — mostra o erro real. REVERTER depois de resolvido!
    echo json_encode(['success' => false, 'message' => 'Erro no servidor: ' . $e->getMessage()]);
    // echo json_encode(['success' => false, 'message' => 'Erro no servidor. Tenta novamente mais tarde.']);
}
