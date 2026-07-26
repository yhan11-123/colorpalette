// account.js — the account screen.
//
// An account is an upgrade, never a gate. Rule 6: there is no login wall in
// front of making. Every visitor already has an anonymous account from their
// first page load; this screen only attaches an email to it so the same shelf
// can be reached from another device.
//
// Two paths, and the difference matters:
//
//   linkEmail()  keeps the current user id, so palettes and saves stay owned.
//   signIn()     switches to a different user id, and does not carry anything.
//
// The first is the default. The second is offered separately and warned about,
// because a visitor who picks it by mistake loses the shelf they were building.

import { auth, listMade, listSaved } from './db.js';

const el = id => document.querySelector('#' + id);

const ui = {
	status: el('status'),
	linkPanel: el('linkPanel'), linkForm: el('linkForm'),
	linkEmail: el('linkEmail'), linkMessage: el('linkMessage'),
	signInPanel: el('signInPanel'), signInForm: el('signInForm'),
	signInEmail: el('signInEmail'), signInMessage: el('signInMessage'),
	signInWarning: el('signInWarning'),
	outPanel: el('outPanel'), signOut: el('signOut'),
};


async function render() {
	const user = await auth.current();

	if (!auth.supported) {
		ui.status.textContent =
			'Running on this browser\'s storage. Accounts need a database — put your ' +
			'Supabase URL and anon key in js/config.js, then run db/schema.sql.';
		return;
	}

	if (!user) {
		ui.status.textContent = auth.error
			? `No session — ${auth.error.message}. Turn on Authentication → Sign In / Providers → Anonymous sign-ins in the Supabase dashboard, then reload.`
			: 'No session. Reload the page.';
		return;
	}

	if (user.isAnonymous) {
		const held = (await listMade()).length + (await listSaved()).length;

		ui.status.textContent = held
			? `Anonymous account, holding ${held} ${held === 1 ? 'palette' : 'palettes'}.`
			: 'Anonymous account. Nothing made or saved yet.';

		// The warning is only true if there is something to lose, so it is only
		// shown when there is.
		ui.signInWarning.textContent = held
			? `For an account made on another device. The ${held} ${held === 1 ? 'palette' : 'palettes'} in this browser stay behind under the anonymous account.`
			: 'For an account made on another device. Nothing is held here, so nothing is left behind.';

		show(ui.linkPanel, ui.signInPanel);
		return;
	}

	ui.status.textContent = `Signed in as ${user.email}.`;
	show(ui.outPanel);
}

function show(...panels) {
	for (const panel of [ui.linkPanel, ui.signInPanel, ui.outPanel]) {
		panel.hidden = !panels.includes(panel);
	}
}


/* ---------- attach an email to this account ---------- */

ui.linkForm.addEventListener('submit', async event => {
	event.preventDefault();
	await send(ui.linkForm, ui.linkMessage, ui.linkEmail.value.trim(), auth.linkEmail);
});


/* ---------- sign in as somebody else ---------- */

ui.signInForm.addEventListener('submit', async event => {
	event.preventDefault();
	await send(ui.signInForm, ui.signInMessage, ui.signInEmail.value.trim(), auth.signIn);
});


// Both forms do the same thing: post an address, then wait for a click in an
// inbox. Nothing changes on this page until the link is followed.
async function send(form, output, email, action) {
	const button = form.querySelector('button');
	button.disabled = true;
	output.textContent = 'Sending…';

	try {
		await action.call(auth, email);
		output.textContent = `Link sent to ${email}. Open it in this browser — the tab you land on is the one that gets signed in.`;
	} catch (error) {
		// Errors say what happened and what to do next. The common one here is
		// an address that already has an account, which is exactly what the
		// other form on this page is for.
		output.textContent = `${error.message} If that address already has an account, use the other form to sign in to it instead.`;
		button.disabled = false;
		return;
	}

	button.disabled = false;
}


/* ---------- sign out ---------- */

ui.signOut.addEventListener('click', async () => {
	ui.signOut.disabled = true;

	try {
		await auth.signOut();
		// db.js signs a fresh anonymous user straight back in, and a reload is
		// the simplest way to let every page pick that new session up.
		location.reload();
	} catch (error) {
		ui.status.textContent = `Could not sign out: ${error.message}`;
		ui.signOut.disabled = false;
	}
});


// A magic link lands back on this page with tokens in the URL; the Supabase
// client consumes them and fires here once the session is live.
auth.onChange(() => render());

render();
