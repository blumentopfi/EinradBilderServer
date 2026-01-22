#!/usr/bin/env node

/**
 * Setup Admin User
 *
 * Creates the initial admin user for the gallery application.
 * Run this script once during initial setup or to reset admin access.
 */

const readline = require('readline');
const { createUser, getUserByUsername, countUsersByRole } = require('./lib/userManager');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  console.log('\n===========================================');
  console.log('   Einrad Bildergalerie - Admin Setup');
  console.log('===========================================\n');

  // Check if any admin users exist
  const adminCount = countUsersByRole('admin');

  if (adminCount > 0) {
    console.log(`⚠️  Es existieren bereits ${adminCount} Administrator(en) im System.\n`);
    const confirm = await question('Möchten Sie einen weiteren Administrator erstellen? (ja/nein): ');

    if (confirm.toLowerCase() !== 'ja' && confirm.toLowerCase() !== 'j') {
      console.log('\nSetup abgebrochen.');
      rl.close();
      return;
    }
  }

  console.log('Bitte geben Sie die Daten für den Administrator ein:\n');

  // Get username
  let username = '';
  while (!username) {
    username = await question('Benutzername (3-30 Zeichen, nur a-z, 0-9, -, _): ');
    username = username.trim().toLowerCase();

    if (username.length < 3 || username.length > 30) {
      console.log('❌ Benutzername muss zwischen 3 und 30 Zeichen lang sein.\n');
      username = '';
      continue;
    }

    if (!/^[a-z0-9_-]+$/.test(username)) {
      console.log('❌ Benutzername darf nur Buchstaben, Zahlen, _ und - enthalten.\n');
      username = '';
      continue;
    }

    // Check if username exists
    const existingUser = getUserByUsername(username);
    if (existingUser) {
      console.log('❌ Dieser Benutzername ist bereits vergeben.\n');
      username = '';
      continue;
    }
  }

  // Get display name
  const displayName = await question(`Anzeigename (optional, Enter für "${username}"): `);
  const finalDisplayName = displayName.trim() || username;

  // Get password
  let password = '';
  while (!password) {
    password = await question('Passwort (mindestens 8 Zeichen): ');

    if (password.length < 8) {
      console.log('❌ Passwort muss mindestens 8 Zeichen lang sein.\n');
      password = '';
      continue;
    }

    const confirmPassword = await question('Passwort bestätigen: ');

    if (password !== confirmPassword) {
      console.log('❌ Passwörter stimmen nicht überein.\n');
      password = '';
      continue;
    }
  }

  // Create admin user
  try {
    console.log('\n🔐 Erstelle Administrator-Konto...');

    const user = createUser(username, password, 'admin', finalDisplayName, 'setup-script');

    console.log('\n✅ Administrator erfolgreich erstellt!');
    console.log('\n===========================================');
    console.log('   Admin-Konto Details');
    console.log('===========================================');
    console.log(`Benutzername: ${user.username}`);
    console.log(`Anzeigename:  ${user.displayName}`);
    console.log(`Rolle:        Administrator`);
    console.log(`Erstellt am:  ${new Date(user.createdAt).toLocaleString('de-DE')}`);
    console.log('===========================================\n');
    console.log('Sie können sich jetzt mit diesen Zugangsdaten anmelden.');
    console.log('Starten Sie den Server mit: npm start\n');

  } catch (error) {
    console.error('\n❌ Fehler beim Erstellen des Administrators:', error.message);
    process.exit(1);
  }

  rl.close();
}

// Handle Ctrl+C gracefully
rl.on('SIGINT', () => {
  console.log('\n\nSetup abgebrochen.');
  rl.close();
  process.exit(0);
});

// Run setup
setup().catch(error => {
  console.error('Fehler:', error);
  rl.close();
  process.exit(1);
});
