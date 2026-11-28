# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- In "Add a wallet", a line under "Import a file" says which files it reads: a descriptor, extended public key or address in a .txt or .desc file, a wallet export in .json, or a BSMS record in .bsms.
- On the Broadcast page, a line under "Import a file" says which files it reads: a PSBT in .psbt, a signed transaction in .txn or .tx, or either one as text in .txt or .hex.
- With an app lock set, Gerfaut locks again once you have been away: 5 minutes after your last key, click or scroll in its window, whether the window is in front or not. It used to stay unlocked until you closed it. "Lock when away" in Settings › Security sets the delay to Immediately, 1 min, 5 min or 15 min. Immediately also locks as soon as you switch windows. A file dialog that Gerfaut opens, or the QR scanner while its camera is on, does not count as time away.
- A wallet can wear the shape of a signing device: the icon picker in Settings › Wallets has a Devices section with 25 drawings, from sticks and small screens to cards, keypads and self-built boards, beside the seven symbols. The picker is now a grid of eight, and the arrow keys move through it by row and column.
- While its window is open and unlocked, Gerfaut syncs your wallets again every 10 minutes. It used to sync once at startup, then only when Live heard a transaction. A sync that fails is tried again 10 minutes later.
- The sidebar says when your wallets last synced, under "Sync all", on every page, such as "Synced 2 min ago". With several wallets, it dates the one synced longest ago. After a failed sync it reads "Sync failed" above the date of the last sync. With the sidebar folded, the date is in the tooltip of the sync button.
- A Privacy policy button in Settings › About opens the policy on gerfaut-wallet.com, which lists every request Gerfaut sends and who receives it.
- When you save a backend in Settings › Network, Gerfaut tests the connection and says what it found under Save backend. A server that answers shows its block height and software. One that does not gets the reason and what to change, such as a port that expects TLS or a server on another network. "Test again" runs the test once more. It replaces the note that said the certificate of a server that did not answer was unchecked. While a test runs, "Cancel" stops it. The backend stays saved, untested. Editing the form during a test stops it too.
- A wallet name too long for the sidebar shows in full in a tooltip, on the wallet button and in the wallet menu, when you point at it or reach it with the keyboard.
- When you type your own Electrum server in Settings › Network, "Use TLS" follows the address, as it already did for a scanned one, until you set it yourself. It turns off on a port that usually runs without TLS, such as 50001, and for an onion address on any port but a TLS one such as 50002, since Tor already encrypts the connection. A line under the form says when and why.
- The Receive page still opens on the first address no transaction has reached, in a block or in the mempool. If that address may have been shown before, because Gerfaut showed it from any button of the page, even before a restart, or because an address after it received a payment, a note under it says so, and New address goes to the first address Gerfaut has never shown. Every address the page shows counts as shown, including one reached with Next address, and a sync watches it.

### Changed

- Smoother, consistent animations across the app. Dialogs, menus, tooltips and the confirmation toast now fade out as they close, the dim behind a dialog fades with it, and a page that finishes loading fades in without shifting. A spinning icon finishes its turn before it stops. Switching themes changes every colour at once. With "Reduce motion" turned on in your system, nothing slides or turns any more, but fades remain.
- A wrong PIN or password on the lock screen is now written in red, fading in under a field with a red edge, until you type again. A button that changes its words while it works, such as "Add wallet" to "Adding…", fades from one to the other and keeps its width. A wallet you drag in Settings › Wallets lifts on a shadow instead of turning see-through.
- In Settings › Wallets, a wallet's icon is changed by clicking the icon itself, left of its name. The Icon button on the right is gone.
- The update check asks gerfaut-wallet.com for the latest version instead of the GitHub API, and "Get" opens the download page of gerfaut-wallet.com. When the check fails, Settings › About says "Could not check for updates." Version 0.1.0 still asks the old GitHub address, which no longer answers, so it never learns that a new version is out. Install this one by hand from gerfaut-wallet.com/download, once, and Gerfaut tells you about the next ones.
- Gerfaut's source code now lives at github.com/gerfaut-dev, and "Report a problem" opens its issues there.
- A sync more than 30 minutes old is written in amber behind a clock, in the sidebar, under the title of Transactions and UTXOs, and on the "Last sync" row of the Overview. With the sidebar folded, an old or failed sync puts a small amber mark on the sync icon.
- After a failed sync, the "Last sync" row of the Overview still says when the last sync went through, such as "4 min ago · Sync failed", above the reason.
- The times of the sync lines, such as "2 min ago", move on while a page stays open. They used to keep the value they were first drawn with.
- On the Policy page, the pill of a path under a relative lock keeps to the count, such as "1 of 3 coins unlocked". How long the next coin waits stays on the "Next coin" line, which reads "known after the first sync" until the wallet has synced once. Coins one block away from unlocking get a line of their own, such as "1 waiting for a block". The pill used to say all of it at once.
- Dialogs, select lists, switches and choice rows now use Radix primitives. In a select list, typing the first letters of an option jumps to it, and the list opens above its field when there is no room below. While a dialog is open, screen readers no longer reach the rest of the window.
- Help lines that repeated a label or a title are gone from Settings, Receive, Broadcast, Export and Transactions.
- Every page has the same header. The title lines up with the left edge of the cards and sits at the same height from one page to the next.
- The tables of the Receive page show each address in full when the column has room, and cut it in the middle when it does not.
- In Settings, card titles are larger, a row keeps the same height with or without a help line, and help lines wrap at a reading width. The Export page uses the same rows.
- Checkboxes and radio buttons are drawn in the colors of the app, in the light theme and in the dark one. In a high contrast mode, the system draws them.
- The Overview keeps its two columns down to the smallest window. It used to stack its cards in one column under 1024 pixels, with the balance history below the fold.
- In Settings › Wallets, the name of a wallet takes the room the row has. "Move up" and "Move down" no longer hold 88 pixels of it while they are hidden.
- A policy that could not be loaded shows the error with a "Try again" button.
- In Settings › Network, the Tor card says when a proxy on this computer is not taken for your own Tor: in Automatic, that another account runs it, or that Gerfaut cannot tell which account does, so the built-in Tor is used and System Tor overrides that; by name in System Tor, that another account runs the proxy and can see which servers Gerfaut reaches. The notes sit in a panel under their card. In Settings › Network, the backend card says when the public server you chose is no longer offered, and that Gerfaut tries the public servers in turn until you choose another.
- Under "Lock when away", the help line says that Immediately does not lock when you go to a file dialog or the QR scanner that Gerfaut opened.
- In "Add a wallet", an input that is refused is marked with an icon, as on the Broadcast page.
- A button with a label that cannot be pressed yet is drawn hollow, with a thin edge and its label in grey. Faded to half strength, its label was too pale to read.
- In the Transactions list, a transaction with 6 confirmations or more shows a small grey check in place of the green "Confirmed" pill. The pill stays for what still moves: "Pending", then the count of confirmations for the first 5.
- Under 6 confirmations, the pill shows a small pie next to the count, one sixth filled for each confirmation, in the lists and in a transaction's details. A screen reader says "3 of 6 confirmations".
- The UTXOs list counts the confirmations of each coin: "Pending" while it waits, the pill with its pie under 6, then the same grey check.

### Fixed

- The tip of the falcon's beak is no longer cut flat wherever the mark appears, such as the sidebar and the lock screen, at some window sizes and display scales.
- When the price source fails, amounts keep their fiat value with the last price, for up to 6 hours. Settings › General shows its age next to the rate under Price source, such as "updated 4 min ago". It used to take the fiat value off every amount at the first failed request, and show "The price source did not answer." in orange.
- A single failed price request is no longer shown. After a second one in a row, a note under the price says what happened and what to do, such as "CoinGecko is not answering. Amounts use the last price until it answers. You can also switch to mempool.space.", with a "Try again" button. When the source limits requests, the note says when Gerfaut asks again, and has no button.
- Gerfaut asks a failing price source again after 1 minute, then waits longer each time, up to 30 minutes, and follows the wait the source names. It used to ask again one second later.
- The Bitcoin price chart of the Overview stays when it cannot be refreshed, with its age under it, such as "Updated 12 min ago".
- With many wallets, "Add a wallet" stays at the bottom of the wallet menu in the sidebar, under a list that scrolls. It used to be the last row of that list, out of sight past eleven or twelve wallets.
- With no wallet added yet, Overview in the sidebar can be clicked. It used to be greyed out, so once you had opened Settings, "Add a wallet" was the only way back to the first page.
- The AppImage keeps its own cache of GStreamer plugins, in Gerfaut's folder of the user's cache (`~/.cache/com.gerfautwallet.gerfaut` by default). It used to share the system's one, so after every start of Gerfaut, the other apps that play media through GStreamer scanned all their plugins again.
- With no network, a sync fails and says so at once. It used to stay on "Syncing…" until the system saw a network again, even for a node on the same machine.
- During the first sync of a wallet, the Overview says "Syncing…" and shows a dash in place of the balance and of the counts. It used to show a balance of zero, "Not synced yet.", "Last sync never" and "No transactions yet". The dash also shows beside the title of Transactions and UTXOs, and under the name of the wallet in the sidebar. The two lists say "Syncing…" as well, where they said "No transactions yet" and "No unspent outputs".
- In the dark theme, a radio button that was not selected showed as a dark disc with no ring in Settings › Network, and the "Received" arrow had lost its square background.
- At the smallest window width, the tabs of Settings wrap onto a second line. "Backup & sync" used to be cut at the edge and "About" was out of sight.
- In the dark theme, the grey text of address chips, fields and help lines is lighter and easier to read on their raised background.
- With no wallet, the sidebar no longer marks "Overview" as the current page.
- The "Next" button of the welcome tour stays where it is from one page to the next.
- Closing the QR scanner while the system still asks for camera access no longer leaves the camera on once access is granted.
- A scan that stops on a code with too many parts no longer leaves the aiming frame over a frozen picture.
- On the Broadcast page, when a status check fails after an earlier answer, the card now reads "Could not check" and shows the error, then the last answer with its time. It used to keep the earlier badge, such as "Confirmed", next to the error. A check that fails before any answer now shows "Could not check" too, and the card keeps it while the backend is asked again.
- A transaction sent just before "Start over" or a network change no longer brings its status card back on top of the next transaction. The transaction still goes out and is listed under "Past broadcasts".
- A file opened on the Broadcast page is no longer previewed when the network changes while it is still being read.
- A wallet's pages no longer say "Syncing…" while another wallet syncs. A sync the live watch starts now shows as syncing on its wallet's pages too.
- A wallet whose last sync failed still says so after a restart, instead of showing its last good sync until the next attempt.
- A transaction with an input whose final signature field is present but empty reads as not yet signed. It used to read as ready to broadcast, and no node would take it.
- A mining reward paid to a watched address counts as immature until its 100th confirmation, as it already did in a descriptor wallet.

### Security

- An Esplora server on plain `http://`, other than a `.onion` one, now carries the same "in the clear" warning as an Electrum server without TLS: what Gerfaut asks it and what it answers travel unencrypted.
- Gerfaut no longer takes the height of a block on a server's word. The work of a block proves it was mined, not where it sits, so a server could serve real blocks at heights of its own and make a payment look deeper than it is. On mainnet, the height of every server tip, and of the block of every confirmation that no checkpoint vouches for, is now proven by the block's own coinbase.
- A wallet that a server fooled with heights too high is repaired by the next server whose latest block is recent. A server that is far behind, with an old latest block, is refused and changes nothing in the wallet.
- An Electrum certificate that has expired, is not valid yet or was issued for another host is refused with that reason. It used to read as a certificate nobody vouches for.
- The build compiles only a revision of gerfaut-core that its main branch has reached. GitHub serves any commit of a fork by its hash, so a pinned hash alone could point at code that was never merged.
- On Linux and macOS, the data folder is closed to other accounts before the vault is written there. It used to be closed just after the vault was opened.
- When Gerfaut cannot take a copied secret off the clipboard after its minute, it says so: "Could not clear the clipboard. Copy something else over it." It used to give up without a word.
- A file name suggested in a save dialog no longer carries the characters that reverse the order of what is shown, which could make a file read as `report.csv` and end in `.exe`.
- Removing a wallet now also drops what the window held for it: its page, its cached balances and transactions, the window's list of transactions sent from the Broadcast page, the state of its syncs, and on Linux its notifications, which are closed. On Windows and macOS, notifications already in the system's list stay there until you clear them.
- The built-in Tor client is arti 2.8.0, with its security fixes.

## [0.1.0] - 2026-10-21

The first release: Gerfaut for Linux, macOS and Windows, as a public beta.

Gerfaut watches bitcoin wallets it cannot spend from. There is no key generation, no seed handling and no signing anywhere in the code, and no Send button in the interface.

### Added

#### Watching a wallet

- Add a wallet from an output descriptor, an extended public key, a single address, a BSMS record or another wallet's export file. Paste it, open the file, or scan its QR code with the camera, including the animated ones a signing device shows. A long animated code reads as fast at its last frame as at its first.
- Before it stores anything, Gerfaut says what it recognized, with the script type, the first address and the network. When the input leaves the script type or the derivation open, you pick them on the same screen. Anything that holds a private key or a seed phrase is refused.
- Watch several wallets on mainnet, signet, testnet4 or regtest. Rename them, give them an icon, and drag them into the order you want.
- For each wallet: the balance, the transaction history, the detail of each transaction with its inputs and outputs, and the UTXOs in a table of their own.
- The Receive page shows the next unused address. "Next address" skips any address a payment already reached and stops 200 unused addresses ahead, and the gap limit warning counts the unused addresses since the last used one.
- Every wallet gets a Policy page: each spending path, primary paths first, the keys that can take it, and the time left on the paths that wait for a timelock. A path open now shows in green, and one that opens within 30 days in amber. Its Descriptor section shows and copies the whole wallet as one multipath descriptor, with `/<0;1>/*`.
- Export the history of a wallet as CSV, over a date range typed as `YYYY-MM-DD` and read as whole days in UTC.

#### Broadcasting a signed transaction

- Broadcast a transaction someone else signed: paste its hex, open the file a signing device wrote, or scan its QR code. The preview shows what the transaction does before anything goes out, and Gerfaut follows it until it confirms.
- The preview flags what needs checking. A missing signature reads "Not fully signed" and keeps the "Broadcast" button off; so does a transaction the network is sure to refuse, which reads "Will be refused". A coin no backend could confirm is marked in amber, and when its amount is only what the PSBT declares, the fee and the input total read "as the PSBT claims".
- A signature made with SIGHASH_NONE or SIGHASH_SINGLE gets a red warning, repeated in the confirmation dialog: whoever relays such a transaction before it confirms can send some or all of the money elsewhere.
- On a PSBT still missing signatures, the fee rate reads "≈ … once signed", the rate it pays once your signing device has signed it. A transaction already waiting in the mempool reads "Already in the mempool" and can go out again, which does no harm.

#### Talking to the chain

- Public servers by default, with no setup: "Automatic" tries every public Esplora instance in turn, or you pick one public Esplora or Electrum server by name. You can also connect your own node, over Esplora or Electrum.
- An Electrum server with a self-signed certificate shows its fingerprint, subject and expiry date. Gerfaut trusts it only once you accept it, and refuses any other certificate from that server afterwards.
- A `.onion` backend goes through Tor. Gerfaut uses the Tor already running on the computer when there is one, and starts its own built-in client, arti, otherwise. The first connection can take up to a minute and a half while it bootstraps. When a `.onion` server stays silent for 30 seconds, the built-in Tor opens a second route to it alongside the first one, and Gerfaut uses whichever answers.
- Gerfaut syncs when it opens and when you ask, and a rescan is a separate action. A sync downloads only what a wallet lacks, so a payment that Live notices costs a few kilobytes. Gerfaut reads a wallet in full when the vault opens and once a day. Past the last used address, a sync asks the server about as many unused addresses as the gap limit, and no more.
- A "This is my node" switch under the address of your own server, in Settings › Network. Turned on, it lets Live follow up to 20,000 addresses, against 2,000 otherwise. Leave it off for a server you do not run: it would refuse most of them and learn every one.
- With Live on and the Automatic backend, syncs, transaction previews and broadcasts go first to the operator Live talks to, Blockstream on mainnet, so a single operator sees your addresses. When Gerfaut opens, the first sync waits up to 20 seconds for Live to connect.
- A preview or a broadcast moves to another server only when one cannot be reached. When a node refuses a transaction, Gerfaut asks no other and shows the node's own words.
- A server that is down while another one answers goes to the end of the list for 5 minutes, then twice as long each time it fails again, up to an hour. When the server Live talks to sees no new block for 2 hours, Gerfaut compares it with another server of the same operator, and Live moves there if it lags 2 blocks or more.

#### Getting told when something moves

- Live alerts, off until you turn on "New transactions" in Settings › Notifications. Gerfaut then keeps one connection open to your backend and posts a system notification when a transaction reaches the mempool, incoming or outgoing, and again when it confirms.
- An Electrum server pushes changes within seconds, and a mempool instance pushes them for the addresses it agrees to follow. Gerfaut checks any other Esplora server once a minute, a few addresses at a time, and goes through every address in turn.
- Live runs for as long as Gerfaut is open, minimised and locked included, and the pages update at the same moment. A notification uses the same words as on Android: it names the wallet and the amount, and leaves the amount out while amounts are hidden. While Gerfaut is locked, it names no wallet and no amount.
- Each transaction is announced once when it appears and once when it confirms, across restarts, whether Live or a sync saw it first. A fee bump brings no new notification. Past 3 transactions in one wallet at once, one line counts the rest, and notifications stop at 20 a minute.
- On Linux and Windows, when a pending payment confirms or is no longer coming while Gerfaut is still open, the new notification replaces the pending one. On macOS, both stay side by side in the notification center.
- When an incoming payment leaves the mempool and nothing pays you in its place, Gerfaut says so: "A pending payment of 0.00150000 BTC is no longer coming".
- Settings › Notifications shows where Live stands, such as "Connected · Electrum · host" or "Polling every minute · host", and what the open connection tells the server. A "Send a test notification" button checks that the system shows them.
- When Live cannot follow every address, Settings › Notifications says how many addresses of how many wallets wait for the next sync, and how to lift the limit. Each wallet shows "Live", "Partly live" or "At next sync" in Settings › Wallets and on its Overview, and "Always watch live first", under Settings › Wallets › Advanced, picks the wallets Live follows first.
- When a server takes only part of your addresses, Live asks it again for all of them a day later, or an hour later when it took none. On your own node, when the server itself refuses addresses, the note names the server setting that lets it follow more.

#### Keeping it yours

- Export every wallet into a backup sealed with a password of your own, as a file or as an animated QR code. The same backup restores on Android or on another computer. It holds descriptors and addresses, never a private key, and the page where you pick the password warns that a copied file can be guessed offline.
- A backup can also carry your backend choice, accepted certificates and gap limit. Restoring one shows what it will put in place before anything changes, and never replaces a certificate you already accepted. A wallet whose keys belong to another network says which one. A wrong password, a file that is not a Gerfaut backup and a backup written by a newer Gerfaut each get their own sentence, so Gerfaut never blames a password that was right. A wallet Gerfaut cannot watch stays on the restore list, unticked, with the reason, and the confirmation names it once the others are restored.
- Fiat value beside the balance, in the currency you pick, from mempool.space, the default, or CoinGecko. With CoinGecko, "Powered by CoinGecko" shows once on each screen that uses its prices. No price source hears from Gerfaut until you turn "Fiat value" on. A wallet on signet, testnet4 or regtest shows 0 in your currency, since test coins are worth nothing.
- Amounts in BTC or in sats, and a light, dark or system theme.
- A check for a newer version, from a button in Settings › About and on its own at most once a day while Gerfaut is unlocked, the first time a day after Gerfaut first opened. It asks GitHub for the latest release, with no identifier attached, and never announces a pre-release. When a newer one is out, a strip above the page says so, and a switch in Settings › About turns the automatic check off.
- Settings › About marks a 0.x version as a beta and has a "Report a problem" button that opens the issues of this repository. The first page of the welcome tour says that Gerfaut is in public beta.
- Opening Gerfaut while it already runs brings its window to the front. When the vault cannot open at startup, the window says why and offers "Try again", and two copies of Gerfaut never open the same vault.
- The arrow keys move through choice groups, Enter submits the app lock dialogs, and screen readers announce form errors.

### Security

- The wallet list is stored encrypted, under a key that the operating system's credential store keeps: the Secret Service on Linux, the macOS Keychain or the Windows Credential Manager.
- A server cannot make up a confirmation. Gerfaut checks that the transaction is in the block the server names and, on mainnet, that the block carries the work the network asked for. Over Electrum, a confirmation in an older block must also link to the checkpoints built into Gerfaut. When no other server answers in place of one whose proof does not hold, the sync says that a server sent a false proof, whether you started it, it covered every wallet or Live started it. Over Esplora, a confirmation from before March 2014 must also link to the checkpoints, and every block height a server gives must carry the work of its block. A server cannot take a confirmation away either: to replace a block that holds one, it must send the headers of its new chain, each linked to the one before and, on mainnet, carrying the work of its height.
- Lock Gerfaut with a PIN or a password. While it is locked, the vault refuses every command the lock screen does not need, the window holds no descriptor and no balance, and Gerfaut opens no file dialog.
- When one of your backends is a `.onion` address, the price and the update check go through Tor too, and Gerfaut sends neither when Tor is out of reach. The automatic check never starts Tor for itself. It uses the Tor already running on the computer, or the one a sync or Live started, and when there is none, the day does not count and it asks again at the next unlock or within the hour. An Electrum host that hides a port is refused, so an onion name never reaches the system resolver.
- The built-in Tor client is arti 2.7.0, with its security fixes. A relay can no longer fill memory through half-closed streams, and a directory mirror can no longer do it through the consensus it sends, or stall Tor by holding back its answer.
- Copying a descriptor keeps it out of the clipboard managers that honour its flag on Linux and macOS, and out of the clipboard history and the cloud clipboard on Windows. Gerfaut clears it from the clipboard after a minute, unless you copied something else since. When it cannot, the toast says so and asks you to clear the clipboard yourself.
- The window calls only Gerfaut's own commands, never shows a page other than Gerfaut's own, and opens only the addresses Gerfaut links to: the block explorer, the releases page and the issues page.
- Gerfaut refuses, before reading it, a file far too large to be a wallet or a transaction. It also refuses an animated QR code that announces more than 5,000 parts, and a sync that reports a transaction worth more than 21 million bitcoin.
- The Broadcast preview checks each previous transaction it fetches against its txid, adds up amounts with overflow checks, and flags a time lock only when an input's sequence enables it.
- On macOS, a second launch finds the first one through a socket in your own temporary folder, not in the `/tmp` folder that every account on the Mac shares.
- Every release carries a `SHA256SUMS` manifest signed with minisign, and [README.md](README.md) gives the key and the commands to check it. The workflow that builds a release pins every action and packaging tool by hash, and every job runs with a read-only token except the last one, which only drafts the release.
