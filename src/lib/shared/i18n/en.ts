/** English is the complete source catalog. Every other catalog is a partial of it. */
export const en = {
  'brand.tagline': 'a little room to think',
  'brand.home': '{title} home',

  'shell.skip': 'Skip to notes',
  'shell.sidebar': 'Sidebar',
  'shell.menu': 'Menu & search',
  'shell.drawer': 'Notebook navigation',
  'shell.utilities': 'Utilities',
  'shell.trash': 'Trash',
  'shell.settings': 'Settings',
  'shell.calendarAndTags': 'Calendar and tags',
  'shell.monthActivity': 'Month activity',
  'shell.calendarUnavailable': 'Calendar is unavailable right now.',
  'shell.tags': 'Tags',
  'shell.allTags': 'All tags ({count})',
  'shell.noTags': 'No published tags yet.',
  'shell.expandTag': 'Show subtags of #{tag}',
  'shell.collapseTag': 'Hide subtags of #{tag}',
  'shell.tagCount': '#{tag}, {count} notes',
  'shell.version': 'Version {version}',
  'shell.activeFilters': 'Active filters',
  'shell.noFilters': 'All notes · no active filters',
  'shell.clearAll': 'Clear all',
  'shell.allNotes': 'All notes',

  'search.label': 'Search notes',
  'search.failed': 'Search could not load. Edit the query to retry.',

  'auth.signIn': 'Sign in',
  'auth.username': 'Username',
  'auth.password': 'Password',
  'auth.mfaCode': 'Authenticator or recovery code',
  'auth.startAgain': 'Start again',
  'auth.verify': 'Verify code',
  'auth.wait': 'Please wait…',
  'auth.mfaPrompt':
    'Enter your authenticator code or a single-use recovery code. This challenge expires in five minutes.',
  'auth.invalid': 'Invalid username or password.',
  'auth.failed': 'Unable to sign in. Please retry.',
  'auth.network':
    'Could not reach the server. Your inputs remain here; please retry.',
  'auth.noscript': 'JavaScript is required to submit this authentication form.',

  'setup.title': 'Set up',
  'setup.heading': 'Set up your notebook',
  'setup.timedOut':
    'Setup has timed out. Restart PandaNote on the server to open it again:',
  'setup.intro':
    'Step 1 of 2. Setup is open for 60 minutes after the server starts. The first visitor to create an account owns this notebook.',
  'setup.username': 'Username',
  'setup.email': 'Email',
  'setup.emailHelp': 'Required for future use; not verified. No email is sent.',
  'setup.password': 'Password',
  'setup.passwordHelp':
    'Use 8–128 characters. Spaces count; no complexity rules.',
  'setup.confirm': 'Re-enter password',
  'setup.create': 'Create account',
  'setup.creating': 'Creating account…',
  'setup.createFailed': 'Could not create account. Please retry.',
  'setup.network':
    'Could not reach the server. Inputs remain here. Retry, or sign in if the account was created.',
  'setup.alreadySetUp': 'An account already exists. Sign in to continue.',
  'setup.signInLink': 'Already created your account? Sign in',
  'setup.noscript': 'JavaScript is required to submit this form.',

  'prefs.title': 'Preferences',
  'prefs.heading': 'Notebook preferences',
  'prefs.intro':
    'Step 2 of 2. All fields are prefilled. Finish setup to open your notebook.',
  'prefs.siteTitle': 'Site title',
  'prefs.language': 'Language',
  'prefs.timezone': 'Timezone',
  'prefs.finish': 'Finish setup',
  'prefs.saving': 'Saving…',
  'prefs.failed': 'Could not finish setup. Please retry.',
  'prefs.network':
    'Could not reach the server. Your choices remain here; please retry.',

  'general.heading': 'General',
  'general.help':
    'The site title appears in the browser tab, the sidebar and on the sign-in page. Language changes apply immediately.',
  'general.siteTitle': 'Site title',
  'general.language': 'Language',
  'general.save': 'Save site title',
  'general.saving': 'Saving…',
  'general.saved': 'General settings saved.',
  'general.failed': 'Could not save general settings. Please retry.',
  'general.network':
    'Could not reach the server. Your choices remain here; please retry.',
  'general.partial':
    'Translation in progress — some screens are shown in English.',

  'settings.title': 'Settings',

  'account.heading': 'Account',
  'account.help':
    'Changing username or email requires fresh authentication. Email is not verified; no email is sent.',
  'account.username': 'Account username',
  'account.email': 'Account email',
  'account.password': 'Password to update account',
  'account.code': 'Account authenticator or recovery code',
  'account.save': 'Authenticate and save account',
  'account.saving': 'Saving…',
  'account.saved':
    'Account saved. Use this username the next time you sign in. Current sessions remain signed in.',
  'account.failed': 'Could not update account.',
  'account.network':
    'Connection failed. Your account details remain here; retry.',
} as const;
export type MessageKey = keyof typeof en;
export type Catalog = Record<MessageKey, string>;
