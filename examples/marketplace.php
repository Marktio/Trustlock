<?php
declare(strict_types=1);
/**
 * The same marketplace walkthrough as marketplace.ts, in PHP. Run against a local TrustLock (TRUSTLOCK_DEV_API_KEY set):
 *   TRUSTLOCK_API_KEY=tlk_... TRUSTLOCK_URL=http://localhost:3000 php examples/marketplace.php
 */
require __DIR__ . '/../sdk/php/TrustLock.php';

use TrustLock\Client;
use TrustLock\TrustLockError;

$tl = new Client(getenv('TRUSTLOCK_API_KEY') ?: '', getenv('TRUSTLOCK_URL') ?: 'http://localhost:3000');
$run = bin2hex(random_bytes(4));
$buyer = "php-buyer-$run";
$seller = "php-seller-$run";

echo "== link users\n";
$tl->users->upsert($buyer, 'Amina Wanjiru', 'client');
$tl->users->upsert($seller, 'Brian Otieno', 'freelancer');
$tl->users->upsert($buyer, 'Amina Wanjiru', 'client'); // safe to repeat

echo "== top up, create, accept, fund\n";
$tl->as($buyer)->wallet->topUp(50000, "topup-$run");
$order = "order-$run";
$terms = ['freelancer' => $seller, 'title' => 'Logo', 'description' => "Acme order $order", 'amount' => 20000, 'review_period_days' => 3, 'revision_limit' => 1,
    'milestones' => [['title' => 'Delivery', 'due_date' => '2026-12-31', 'amount' => 20000]]];
$c = $tl->as($buyer)->contracts->create($terms, "create-$order");
$again = $tl->as($buyer)->contracts->create($terms, "create-$order");
assert($again['id'] === $c['id'], 'same idempotency key must return the same contract');
$tl->as($seller)->contracts->accept($c['id']);
$tl->as($buyer)->contracts->fund($c['id'], "fund-$order");
$w = $tl->as($buyer)->wallet->get();
echo 'buyer wallet: available=' . $w['available'] . ' held=' . $w['held'] . "\n";

echo "== deliver and approve\n";
$tl->as($seller)->contracts->startWork($c['id']);
$data = 'logo-v1';
$tl->as($seller)->contracts->deliver($c['id'], 'logo.pdf', strlen($data), hash('sha256', $data), 'First version');
echo 'buyer can: ' . implode(', ', $tl->as($buyer)->contracts->get($c['id'])['allowed_actions']) . "\n";
$done = $tl->as($buyer)->contracts->approve($c['id'], "approve-$order");
if ($done['state'] !== 'completed') throw new RuntimeException('expected completed, got ' . $done['state']);

echo "== dispute with evidence\n";
$c2 = $tl->as($buyer)->contracts->create([...$terms, 'title' => 'Logo 2'], "create-$order-b");
$tl->as($seller)->contracts->accept($c2['id']);
$tl->as($buyer)->contracts->fund($c2['id'], "fund-$order-b");
$tl->as($seller)->contracts->startWork($c2['id']);
$tl->as($seller)->contracts->deliver($c2['id'], 'logo2.pdf', strlen($data), hash('sha256', $data));
$tl->as($buyer)->contracts->dispute($c2['id'], 'Not what we agreed');
$tl->as($seller)->contracts->submitEvidence($c2['id'], 'Matches the brief', [['file_name' => 'brief.pdf', 'size_bytes' => 10, 'sha256' => hash('sha256', 'x')]]);
if ($tl->as($buyer)->contracts->get($c2['id'])['state'] !== 'disputed') throw new RuntimeException('expected disputed');

echo "== typed errors\n";
try {
    $tl->as($buyer)->contracts->get('00000000-0000-0000-0000-000000000000');
    throw new RuntimeException('expected an error');
} catch (TrustLockError $e) {
    if ($e->status !== 404 || $e->errorCode !== 'NOT_FOUND') throw new RuntimeException("wrong error $e");
    echo 'caught ' . $e->getMessage() . "\n";
}

echo "== webhooks and usage\n";
$ep = $tl->webhooks->create('https://example.com/hooks/trustlock');
if (strlen($ep['secret']) < 16) throw new RuntimeException('no secret');
if (!array_filter($tl->webhooks->list(), fn($x) => $x['id'] === $ep['id'])) throw new RuntimeException('endpoint not listed');
$tl->webhooks->delete($ep['id']);
$body = json_encode(['id' => 'evt_1', 'type' => 'contract.funded', 'created_at' => 'now', 'data' => new stdClass()]);
$t = time();
$sig = "t=$t,v1=" . hash_hmac('sha256', "$t.$body", 'shh');
if (Client::verifyWebhook($body, $sig, 'shh')['id'] !== 'evt_1') throw new RuntimeException('verify failed');
foreach ([substr($sig, 0, -1) . '0', 't=' . ($t - 1000000) . ',v1=' . explode('v1=', $sig)[1], 'garbage'] as $bad) {
    try { Client::verifyWebhook($body, $bad, 'shh'); throw new RuntimeException('bad signature accepted'); }
    catch (UnexpectedValueException) {}
}
echo 'recent calls: ' . implode(', ', array_map(fn($u) => "{$u['method']} {$u['path']} {$u['status']}", $tl->usage(3))) . "\n";
echo "\nPHP client OK\n";
