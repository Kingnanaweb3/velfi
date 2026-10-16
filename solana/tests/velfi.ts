// End-to-end tests against a local validator: `anchor test`.
// The money rules themselves are covered by crates/velfi-core (cargo test);
// these check the Solana wiring: PDAs, vaults, transfers, signers and closes.
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { Velfi } from "../target/types/velfi";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.Velfi as Program<Velfi>;
const conn = provider.connection;
const payer = (provider.wallet as anchor.Wallet).payer; // plays Velfi's fee payer

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idBuf = (id: number) => new BN(id).toArrayLike(Buffer, "le", 8);
const pda = (seed: string, owner: PublicKey, id: number) =>
  PublicKey.findProgramAddressSync([Buffer.from(seed), owner.toBuffer(), idBuf(id)], program.programId)[0];
const ata = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);
const bal = async (a: PublicKey) => Number((await getAccount(conn, a)).amount);
const gone = async (a: PublicKey) => (await conn.getAccountInfo(a)) === null;
const common = {
  tokenProgram: TOKEN_PROGRAM_ID,
  associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
};
async function fails(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e: any) {
    const s = String(e?.error?.errorCode?.code ?? e?.message ?? e);
    assert.include(s, code, `expected ${code}, got ${s}`);
    return;
  }
  assert.fail(`expected failure ${code}`);
}

let mint: PublicKey;
const user = Keypair.generate(); // the Velfi user (Google wallet)
const agent = Keypair.generate(); // Autopilot signer
const alice = Keypair.generate();
const bob = Keypair.generate();
const attacker = Keypair.generate();
let userToken: PublicKey;
let nextId = 1;

before(async () => {
  for (const k of [user, agent, alice, bob, attacker]) {
    const sig = await conn.requestAirdrop(k.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
  }
  mint = await createMint(conn, payer, payer.publicKey, null, 6); // a USDC-like mint
  userToken = (await getOrCreateAssociatedTokenAccount(conn, payer, mint, user.publicKey)).address;
  await mintTo(conn, payer, mint, userToken, payer, 1_000_000_000);
});

describe("guardrail mandate", () => {
  const id = nextId++;
  let mandate: PublicKey;
  let vault: PublicKey;

  it("creates a mandate and locks the budget", async () => {
    mandate = pda("mandate", user.publicKey, id);
    vault = ata(mint, mandate);
    await program.methods
      .createMandate(new BN(id), agent.publicKey, [alice.publicKey, bob.publicKey], new BN(100), new BN(500), new BN(3600))
      .accountsPartial({ owner: user.publicKey, payer: payer.publicKey, mint, ownerToken: userToken, mandate, vault, ...common })
      .signers([user])
      .rpc();
    assert.equal(await bal(vault), 500);
  });

  it("lets the agent pay an allowlisted recipient, creating their token account gaslessly", async () => {
    await program.methods
      .executeMandate(new BN(60))
      .accountsPartial({ caller: agent.publicKey, payer: payer.publicKey, mandate, mint, vault, recipient: alice.publicKey, recipientToken: ata(mint, alice.publicKey), ...common })
      .signers([agent])
      .rpc();
    assert.equal(await bal(ata(mint, alice.publicKey)), 60);
  });

  it("blocks over-cap, unlisted recipients and strangers", async () => {
    const base = { payer: payer.publicKey, mandate, mint, vault, ...common };
    await fails(
      program.methods.executeMandate(new BN(101)).accountsPartial({ ...base, caller: agent.publicKey, recipient: bob.publicKey, recipientToken: ata(mint, bob.publicKey) }).signers([agent]).rpc(),
      "OverPerTxCap",
    );
    await fails(
      program.methods.executeMandate(new BN(10)).accountsPartial({ ...base, caller: agent.publicKey, recipient: attacker.publicKey, recipientToken: ata(mint, attacker.publicKey) }).signers([agent]).rpc(),
      "RecipientNotAllowed",
    );
    await fails(
      program.methods.executeMandate(new BN(10)).accountsPartial({ ...base, caller: attacker.publicKey, recipient: alice.publicKey, recipientToken: ata(mint, alice.publicKey) }).signers([attacker]).rpc(),
      "NotAuthorized",
    );
  });

  it("only the owner can revoke; revoke refunds and closes everything", async () => {
    await fails(
      program.methods.revokeMandate().accountsPartial({ owner: attacker.publicKey, mandate, mint, vault, ownerToken: ata(mint, attacker.publicKey), rentPayer: payer.publicKey, tokenProgram: TOKEN_PROGRAM_ID }).signers([attacker]).rpc(),
      "",
    );
    const before = await bal(userToken);
    await program.methods
      .revokeMandate()
      .accountsPartial({ owner: user.publicKey, mandate, mint, vault, ownerToken: userToken, rentPayer: payer.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([user])
      .rpc();
    assert.equal((await bal(userToken)) - before, 440);
    assert.isTrue(await gone(mandate));
    assert.isTrue(await gone(vault));
  });
});

describe("claim-link escrow", () => {
  it("claims with the link key into any wallet, and rejects other keys", async () => {
    const id = nextId++;
    const link = Keypair.generate();
    const escrow = pda("escrow", user.publicKey, id);
    const vault = ata(mint, escrow);
    await program.methods
      .createEscrow(new BN(id), new BN(250), link.publicKey, new BN(0))
      .accountsPartial({ sender: user.publicKey, payer: payer.publicKey, mint, senderToken: userToken, escrow, vault, ...common })
      .signers([user])
      .rpc();
    const claim = (signer: Keypair) =>
      program.methods
        .claimEscrow()
        .accountsPartial({ claimAuthority: signer.publicKey, payer: payer.publicKey, escrow, mint, vault, claimer: bob.publicKey, claimerToken: ata(mint, bob.publicKey), rentPayer: payer.publicKey, ...common })
        .signers([signer])
        .rpc();
    await fails(claim(attacker), "");
    await claim(link);
    assert.equal(await bal(ata(mint, bob.publicKey)), 250);
    assert.isTrue(await gone(escrow));
  });

  it("refunds the sender only after expiry", async () => {
    const id = nextId++;
    const escrow = pda("escrow", user.publicKey, id);
    const vault = ata(mint, escrow);
    await program.methods
      .createEscrow(new BN(id), new BN(40), Keypair.generate().publicKey, new BN(2))
      .accountsPartial({ sender: user.publicKey, payer: payer.publicKey, mint, senderToken: userToken, escrow, vault, ...common })
      .signers([user])
      .rpc();
    const refund = () =>
      program.methods.refundEscrow().accountsPartial({ sender: user.publicKey, escrow, mint, vault, senderToken: userToken, rentPayer: payer.publicKey, tokenProgram: TOKEN_PROGRAM_ID }).signers([user]).rpc();
    await fails(refund(), "NotExpired");
    await sleep(3500);
    const before = await bal(userToken);
    await refund();
    assert.equal((await bal(userToken)) - before, 40);
  });
});

describe("streams", () => {
  it("vests over time, the recipient claims, and stop splits the rest", async () => {
    const id = nextId++;
    const stream = pda("stream", user.publicKey, id);
    const vault = ata(mint, stream);
    await program.methods
      .startStream(new BN(id), alice.publicKey, new BN(1_000), new BN(8))
      .accountsPartial({ sender: user.publicKey, payer: payer.publicKey, mint, senderToken: userToken, stream, vault, ...common })
      .signers([user])
      .rpc();
    await sleep(3000);
    const aliceToken = ata(mint, alice.publicKey);
    const a0 = await bal(aliceToken);
    await fails(
      program.methods.claimStream().accountsPartial({ recipient: attacker.publicKey, payer: payer.publicKey, stream, mint, vault, recipientToken: ata(mint, attacker.publicKey), rentPayer: payer.publicKey, ...common }).signers([attacker]).rpc(),
      "",
    );
    await program.methods
      .claimStream()
      .accountsPartial({ recipient: alice.publicKey, payer: payer.publicKey, stream, mint, vault, recipientToken: aliceToken, rentPayer: payer.publicKey, ...common })
      .signers([alice])
      .rpc();
    const claimed = (await bal(aliceToken)) - a0;
    assert.isAbove(claimed, 0);
    assert.isBelow(claimed, 1_000);
    const u0 = await bal(userToken);
    await program.methods
      .stopStream()
      .accountsPartial({ sender: user.publicKey, payer: payer.publicKey, stream, mint, vault, recipient: alice.publicKey, recipientToken: aliceToken, senderToken: userToken, rentPayer: payer.publicKey, ...common })
      .signers([user])
      .rpc();
    const toAlice = (await bal(aliceToken)) - a0;
    const back = (await bal(userToken)) - u0;
    assert.equal(toAlice + back, 1_000, "every token accounted for");
    assert.isTrue(await gone(stream));
  });

  it("split stream: claims, stop refunds unvested, close frees rent", async () => {
    const id = nextId++;
    const split = pda("split", user.publicKey, id);
    const vault = ata(mint, split);
    const u0 = await bal(userToken);
    await program.methods
      .startSplitStream(new BN(id), [alice.publicKey, bob.publicKey], new BN(1_001), new BN(6))
      .accountsPartial({ sender: user.publicKey, payer: payer.publicKey, mint, senderToken: userToken, split, vault, ...common })
      .signers([user])
      .rpc();
    assert.equal(u0 - (await bal(userToken)), 1_000, "odd remainder stays with the sender");
    await sleep(2500);
    await program.methods
      .stopSplitStream()
      .accountsPartial({ sender: user.publicKey, split, mint, vault, senderToken: userToken, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([user])
      .rpc();
    for (const r of [alice, bob]) {
      await program.methods
        .claimSplitStream()
        .accountsPartial({ claimer: r.publicKey, payer: payer.publicKey, split, mint, vault, claimerToken: ata(mint, r.publicKey), ...common })
        .signers([r])
        .rpc();
    }
    assert.equal(await bal(vault), 0);
    await program.methods
      .closeSplitStream()
      .accountsPartial({ sender: user.publicKey, split, mint, vault, senderToken: userToken, rentPayer: payer.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([user])
      .rpc();
    assert.isTrue(await gone(split));
  });
});

describe("SafePay and staged pay", () => {
  it("SafePay releases only after both sides confirm", async () => {
    const id = nextId++;
    const safePay = pda("safepay", user.publicKey, id);
    const vault = ata(mint, safePay);
    await program.methods
      .createSafePay(new BN(id), alice.publicKey, new BN(300), new BN(3600))
      .accountsPartial({ sender: user.publicKey, payer: payer.publicKey, mint, senderToken: userToken, safePay, vault, ...common })
      .signers([user])
      .rpc();
    const confirm = (who: Keypair) =>
      program.methods
        .confirmSafePay()
        .accountsPartial({ caller: who.publicKey, payer: payer.publicKey, safePay, mint, vault, recipient: alice.publicKey, recipientToken: ata(mint, alice.publicKey), rentPayer: payer.publicKey, ...common })
        .signers([who])
        .rpc();
    await fails(confirm(attacker), "NotAuthorized");
    const a0 = await bal(ata(mint, alice.publicKey));
    await confirm(alice);
    await fails(confirm(alice), "AlreadyConfirmed");
    assert.equal(await bal(ata(mint, alice.publicKey)), a0);
    await confirm(user);
    assert.equal((await bal(ata(mint, alice.publicKey))) - a0, 300);
    assert.isTrue(await gone(safePay));
  });

  it("staged pay releases milestones in order and cancel refunds the rest", async () => {
    const id = nextId++;
    const stagePay = pda("stagepay", user.publicKey, id);
    const vault = ata(mint, stagePay);
    await program.methods
      .createStagePay(new BN(id), bob.publicKey, [new BN(100), new BN(200), new BN(300)])
      .accountsPartial({ sender: user.publicKey, payer: payer.publicKey, mint, senderToken: userToken, stagePay, vault, ...common })
      .signers([user])
      .rpc();
    const bobToken = ata(mint, bob.publicKey);
    const b0 = await bal(bobToken);
    await program.methods
      .releaseStage()
      .accountsPartial({ sender: user.publicKey, payer: payer.publicKey, stagePay, mint, vault, recipient: bob.publicKey, recipientToken: bobToken, rentPayer: payer.publicKey, ...common })
      .signers([user])
      .rpc();
    assert.equal((await bal(bobToken)) - b0, 100);
    const u0 = await bal(userToken);
    await program.methods
      .cancelStagePay()
      .accountsPartial({ sender: user.publicKey, stagePay, mint, vault, senderToken: userToken, rentPayer: payer.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([user])
      .rpc();
    assert.equal((await bal(userToken)) - u0, 500);
    assert.isTrue(await gone(stagePay));
  });
});
