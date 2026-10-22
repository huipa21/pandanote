/** English is the complete source catalog. Every other catalog is a partial of it. */
export const en = {
  'vault.title': 'Vault',
  'vault.close': 'Close Vault',
  'vault.unlock': 'Unlock Vault',
  'vault.unlockAction': 'Unlock',
  'vault.passwordHelp':
    'Re-enter your account password to show private notes in this signed-in browser session.',
  'vault.required':
    'Unlock the Vault to access private notes or change tags shared with them.',
  'vault.private': 'Private note',
  'vault.makePrivate': 'Make private (visible only with the Vault open)',
  'vault.makePublic': 'Make public (visible with the Vault closed)',
  'vault.syncFailed':
    'Vault status could not be refreshed. Notes are hidden until you retry.',
  'vault.retry': 'Retry Vault status',
  'vault.checking': 'Checking Vault status…',
  'vault.changed':
    'Vault status changed during this request. Retry to refresh your view.',
  'vault.draftCleared':
    'The Vault was closed in another tab. The private editor was cleared.',
  'brand.tagline': 'a little room to think',
  'brand.home': '{title} home',

  'shell.skip': 'Skip to notes',
  'shell.sidebar': 'Sidebar',
  'shell.menu': 'Menu & search',
  'shell.expandSidebar': 'Expand sidebar',
  'shell.collapseSidebar': 'Collapse sidebar',
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
  'shell.activeFilters': 'Active filters',
  'shell.noFilters': 'All notes · no active filters',
  'shell.clearAll': 'Clear all',
  'shell.allNotes': 'All notes',

  'note.actions': 'Note actions',
  'note.pin': 'Pin',
  'note.unpin': 'Unpin',
  'note.unpinNote': 'Unpin note',
  'note.pinned': 'Pinned',
  'note.edit': 'Edit',
  'note.delete': 'Delete',
  'note.cancel': 'Cancel',
  'note.tags': 'Note tags',
  'note.inTrash': 'In Trash',
  'note.back': 'Back',
  'note.restore': 'Restore',
  'note.deletePermanently': 'Delete permanently',
  'note.words': '{count} words',
  'note.created': 'Created',
  'note.updated': 'Updated',
  'tag.actions': 'Tag actions',
  'tag.rename': 'Rename Tag',
  'tag.merge': 'Merge Tag',
  'tag.remove': 'Remove Tag',

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
  'auth.mfaInvalid': 'Incorrect code. Try again.',
  'auth.mfaRestart':
    'Too many incorrect codes or the code step expired. Enter your password again.',
  'auth.failed': 'Unable to sign in. Please retry.',
  'auth.network':
    'Could not reach the server. Your inputs remain here; please retry.',
  'auth.noscript': 'JavaScript is required to submit this authentication form.',

  'setup.title': 'Set up',
  'setup.heading': 'Set up your notebook',
  'setup.timedOut':
    'Setup has timed out. Restart PandaNote on the server to open it again:',
  'setup.intro':
    'Step 1 of 2. Enter the setup code from the server log. Setup is open for 60 minutes after the server starts; the code is shown only until an account exists.',
  'setup.code': 'Setup code',
  'setup.codeHelp':
    'Find it in the server log. Use the newest line, or open the setup link printed there.',
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
    'The site title and tagline appear in the browser tab, the sidebar and on the sign-in page. Changes apply after you save.',
  'general.siteTitle': 'Site title',
  'general.tagline': 'Tagline',
  'general.taglineHelp':
    'Shown under the site title. Leave empty to use the default tagline in the selected language.',
  'general.language': 'Language',
  'general.save': 'Save general settings',
  'general.saving': 'Saving…',
  'general.saved': 'General settings saved.',
  'general.failed': 'Could not save general settings. Please retry.',
  'general.network':
    'Could not reach the server. Your choices remain here; please retry.',
  'general.partial':
    'Translation in progress — some screens are shown in English.',

  'settings.title': 'Settings',

  'security.failedOne':
    '1 incorrect second-factor code since your last sign-in. Someone may know your password — change it.',
  'security.failedMany':
    '{count} incorrect second-factor codes since your last sign-in. Someone may know your password — change it.',
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
  'security.heading': 'Security & session',
  'security.enabled': 'enabled',
  'security.disabled': 'disabled',
  'security.mfaStatus': 'MFA: {state}.',
  'security.recoveryRemaining': '{count} recovery codes remaining.',
  'security.help':
    'Security actions require your password and, when enabled, an unused authenticator or recovery code. Authenticator codes use 30-second steps with ±one step clock drift; accepted codes cannot be reused. Wait for the next code after enrollment.',
  'security.loadFailed': 'Could not load security settings. Retry loading.',
  'security.actionFailed': 'Could not complete security action.',
  'security.confirmRevoke': 'Sign out all devices, including this one?',
  'security.confirmDisable': 'Disable MFA and invalidate all recovery codes?',
  'security.confirmRegenerate':
    'Invalidate every old recovery code and generate ten new ones?',
  'security.enrollNotActive':
    'MFA is not activated until you confirm the new authenticator code.',
  'security.updated': 'Security updated. Other devices have been signed out.',
  'security.connection':
    'Connection failed. Check security status before retrying. If recovery codes were not received, regenerate them.',
  'security.confirmFailed':
    'Could not confirm. Check security status and retry.',
  'security.mfaEnabledMsg': 'MFA enabled. Other devices have been signed out.',
  'security.cancelFailed':
    'Could not cancel enrollment. Retry, or wait five minutes for it to expire.',
  'security.recoveryFileHeader':
    'PandaNote single-use recovery codes\nKeep private. Each code replaces TOTP, not your password.\n\n',
  'security.optEnable': 'Enable MFA',
  'security.optChange': 'Change authenticator',
  'security.optDisable': 'Disable MFA',
  'security.optRegenerate': 'Regenerate recovery codes',
  'security.optPassword': 'Change password',
  'security.optLifetime': 'Change session lifetime',
  'security.optRevoke': 'Sign out all devices',
  'security.action': 'Security action',
  'security.currentPassword': 'Current password',
  'security.codeLabel': 'Authenticator or recovery code',
  'security.newPassword': 'New password',
  'security.passwordHelp':
    'Use 8–128 characters. Spaces count; no complexity rules.',
  'security.sessionDays': 'Session lifetime (days)',
  'security.authContinue': 'Authenticate and continue',
  'security.confirmTitle': 'Confirm authenticator enrollment',
  'security.enrollHelp':
    'Scan this QR code in your authenticator, or enter the secret manually. Keep it private. Enrollment expires in five minutes; your existing MFA stays unchanged until confirmation.',
  'security.qrLabel': 'Authenticator enrollment QR code',
  'security.manualSecret': 'Manual secret:',
  'security.newCode': 'New authenticator code',
  'security.confirmMfa': 'Confirm MFA',
  'security.cancelEnroll': 'Cancel enrollment',
  'security.refresh': 'Refresh security status',
  'security.retryLoad': 'Retry loading security',
  'security.codesLabel': 'New recovery codes',
  'security.codesTitle': 'Save your ten recovery codes now',
  'security.codesHelp':
    'Shown only at generation. Each works once with your password. Regeneration invalidates the old set. These codes do not protect a compromised browser; downloaded backups are also sensitive and unencrypted.',
  'security.downloadCodes': 'Download recovery codes',
  'security.savedConfirm':
    'Have you saved the recovery codes? They cannot be shown again.',
  'security.savedCodes': 'I saved these codes',
  'security.lostAccess':
    'Lost all access? Recovery requires the documented operator command on the VPS. There is no public reset or MFA bypass.',
  'settings.sections': 'Settings sections',
  'settings.tabGeneral': 'General',
  'settings.tabAppearance': 'Appearance',
  'settings.tabCalendar': 'Calendar',
  'settings.tabAccount': 'Account',
  'settings.tabStorage': 'Storage',
  'settings.tabBackups': 'Backups',
  'settings.tabAbout': 'About',
  'settings.signingOut': 'Signing out…',
  'settings.signOut': 'Sign out',
  'settings.signOutFailed': 'Could not sign out. Please retry.',
  'settings.signOutNetwork':
    'Could not reach the server. Please retry signing out.',
  'appearance.heading': 'Appearance',
  'appearance.help':
    'Saved for your notebook, including other signed-in devices on their next page load. Follow system is the initial theme.',
  'appearance.theme': 'Theme',
  'appearance.system': 'Follow system',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.density': 'Density',
  'appearance.comfortable': 'Comfortable',
  'appearance.compact': 'Compact',
  'appearance.spacious': 'Spacious',
  'shell.switchLight': 'Switch to light mode',
  'shell.switchDark': 'Switch to dark mode',
  'shell.switchLanguage': 'Switch language to {language}',
  'shell.preferencesFailed': 'Could not save this preference. Please retry.',
  'appearance.collapse': 'Collapse long notes by default',
  'appearance.collapseHelp':
    'Long cards follow this preference. Show more expands an individual card.',
  'appearance.save': 'Save appearance',
  'appearance.saving': 'Saving…',
  'appearance.saved': 'Appearance saved.',
  'appearance.failed': 'Could not save appearance. Please retry.',
  'appearance.network':
    'Could not save appearance. Your choices remain here; please retry.',
  'about.heading': 'About PandaNote',
  'about.version': 'Version',
  'about.commit': 'Commit',
  'about.commitTime': 'Commit time (UTC)',
  'about.build': 'Build',
  'about.devBuild': 'Local development / non-release build',
  'timeline.signedIn': 'You are signed in.',
  'timeline.outsideRange':
    'This note is outside the current filters or loaded dates. Clear filters or load older notes to find it.',
  'timeline.retry': 'Retry timeline',
  'timeline.clearStart': 'Clear filters and start again',
  'timeline.emptyMonthTitle': 'No matching notes in {month}',
  'timeline.emptyMonth': 'Empty month',
  'timeline.emptyMonthHelp':
    'This selected month is empty. Your search and tags are retained.',
  'timeline.loadOlder': 'Load older notes',
  'timeline.returnToday': 'Return to Today',
  'timeline.noMatchTitle': 'No matching notes',
  'timeline.emptyTitle': 'A quiet place to begin',
  'timeline.noMatchHelp':
    'No published notes match every search term and selected filter. Remove a filter or clear all.',
  'timeline.emptyHelp':
    'Write your first note above. Published notes will appear here.',
  'timeline.loadingOlder': 'Loading older notes…',
  'timeline.retryOlder': 'Retry older notes',
  'timeline.refresh': 'Refresh timeline',
  'timeline.beginning': 'You’ve reached the beginning.',
  'timeline.filtersChanged': 'Filters changed. Start from the first page.',
  'timeline.olderFailed':
    'Older notes could not be loaded. Retry without losing your place.',
  'timeline.latestFailed':
    'The latest note could not be loaded. Retry Refresh timeline.',
  'timeline.description': 'Your private personal notebook',
  'viewer.title': 'Image viewer',
  'viewer.prevImage': 'Previous image',
  'viewer.prev': 'Previous',
  'viewer.nextImage': 'Next image',
  'viewer.next': 'Next',
  'viewer.zoomOut': 'Zoom out',
  'viewer.zoomIn': 'Zoom in',
  'viewer.resetZoom': 'Reset zoom',
  'viewer.downloadWebp': 'Download WebP',
  'viewer.status': 'Image {index} of {total} · {zoom}%',
  'viewer.help':
    '{name} · Arrow keys to navigate, +/− to zoom, 0 to reset. Drag to pan when zoomed; swipe to navigate when fit.',
  'viewer.loading': 'Loading display image…',
  'viewer.failed': 'Image could not be loaded.',
  'viewer.retryImage': 'Retry image',
  'trash.list': 'Trashed notes',
  'trash.noMatch': 'No trashed notes match this search.',
  'trash.empty': 'Trash is empty.',
  'trash.selectAll': 'Select all',
  'trash.restoreSelected': 'Restore selected notes',
  'trash.deleteSelected': 'Delete selected notes permanently',
  'trash.selectedCount': '{count} selected',
  'trash.selectNote': 'Select note from {when}',
  'trash.images': '{count} image(s)',
  'trash.files': '{count} file(s)',
  'trash.finishFirst': 'Finish the open action first, then try again.',
  'trash.stoppedBusy':
    'Stopped after {done} of {total}. Finish the open action, then try the rest again.',
  'trash.stoppedDialog':
    'Stopped after {done} of {total}. Resolve the open dialog, then try the rest again.',
  'trash.olderFailed': 'Older entries failed',
  'trash.olderDefault': 'Could not load older entries.',
  'trash.restoreTitle': 'Restore notes?',
  'trash.deleteTitle': 'Delete notes permanently?',
  'trash.restoreOne': 'Restore {count} note?',
  'trash.restoreMany': 'Restore {count} notes?',
  'trash.deleteOne': 'Delete {count} note permanently? This cannot be undone.',
  'trash.deleteMany':
    'Delete {count} notes permanently? This cannot be undone.',
  'trash.restore': 'Restore',
  'trash.loading': 'Loading…',
  'trash.retryOlder': 'Retry older entries',
  'storage.heading': 'Storage',
  'storage.help':
    'Private server storage, including Trash. Unsaved editors are not included or backed up. The disk is shared with the OS and other applications; free space is not all available for uploads.',
  'storage.measuring': 'Measuring storage…',
  'storage.refresh': 'Refresh storage',
  'storage.measureFailed':
    'Could not reach the server to measure storage. Retry refreshing storage.',
  'storage.requestFailed': 'Storage request failed. Retry.',
  'storage.measured':
    'Measured {date} ({timezone}). Refresh for current usage.',
  'storage.mediaLabel': 'Media (attachments, Trash & unused uploads)',
  'storage.dbLabel': 'SQL database & journals',
  'storage.mediaHelp':
    'Media uses recorded processed bytes; shared files count once. Database size is measured on disk.',
  'storage.jobsQueued':
    '{count} file deletion jobs remain queued. Retry queued cleanup or restart the server; operator inspection may be needed.',
  'storage.retryCleanup': 'Retry queued cleanup',
  'storage.attemptsTitle': 'Unused posting attempts',
  'storage.attemptsHelp':
    '{count} pending attempts. Showing up to 20, oldest activity first. Nothing expires automatically. Only attempts quiet for at least 24 hours can be cleaned. Resuming or uploading renews that protection. Cleanup abandons an entire frozen attempt, not just one of its files.',
  'storage.noAttempts': 'No unused pending attempts.',
  'storage.attemptLine':
    '{ready} ready / {files} files · {size} · last activity {date}',
  'storage.noFiles': 'No selected files',
  'storage.protectedUntil':
    'Protected until {date}. Refresh then; no automatic deletion.',
  'storage.cleanAttempt': 'Clean unused attempt',
  'storage.notMeasured': 'Storage has not been measured.',
  'storage.limitsTitle': 'Upload, image & note limits',
  'storage.limitsHelp':
    'Static images only; originals are not retained after posting. Images are oriented, metadata stripped, resized without upscaling, and stored as display/thumbnail WebP. Quality is 1–100. Lower limits do not delete existing data, but can block uncommitted saves. MiB = 1,048,576 bytes; KiB = 1,024 bytes.',
  'storage.saving': 'Saving limits…',
  'storage.saveLimits': 'Save storage limits',
  'storage.checkLimits':
    'Check the limits. Values must be within the shown bounds and represent whole bytes/pixels.',
  'storage.limitsSaved':
    'Storage limits saved. They apply to new uploads and saves; existing files are not reprocessed.',
  'storage.saveFailed':
    'Could not save storage limits. Your choices remain here; retry.',
  'storage.cleanupQueued':
    'Some byte deletion is still queued. Refresh storage and retry queued cleanup; operator inspection may be needed.',
  'storage.cleanupAttempt':
    'Unused attempt cleaned. Referenced note files were not removed.',
  'storage.cleanupDone':
    'Queued cleanup finished. Referenced note files were not removed.',
  'storage.cleanupFailed':
    'Cleanup was not confirmed. Refresh storage before retrying; the server may have queued deletion.',
  'storage.cleanTitle': 'Clean unused uploads',
  'storage.cleanAttemptQ':
    'Abandon this posting attempt and remove its {count} ready files ({size}) plus unfinished metadata?',
  'storage.cleanQueuedQ':
    'Retry byte deletion that was already confirmed and queued? References are checked again before removal.',
  'storage.cleanNote':
    'Referenced note and Trash files are never selected. The server rechecks references. This cannot be undone.',
  'storage.cleanAttemptWarn':
    'A frozen retry for this batch will no longer work. Keep original files and start a new editable attempt before posting again.',
  'storage.cleanQueuedWarn':
    'Only already-queued files are considered; no additional posting attempts are abandoned.',
  'storage.cleaning': 'Cleaning…',
  'storage.confirmCleanup': 'Confirm cleanup',
  'picker.mon': 'Mo',
  'picker.tue': 'Tu',
  'picker.wed': 'We',
  'picker.thu': 'Th',
  'picker.fri': 'Fr',
  'picker.sat': 'Sa',
  'picker.sun': 'Su',
  'picker.choose': 'Choose date and time',
  'picker.panel': 'Date and time picker',
  'picker.prevMonth': 'Previous month',
  'picker.nextMonth': 'Next month',
  'picker.hour': 'Hour',
  'picker.minute': 'Minute',
  'picker.second': 'Second',
  'picker.done': 'Done',
  'restore.heading': 'Restore uploaded full backup',
  'restore.help':
    'Upload a PandaNote .pnb archive to validate it privately. Replacement is destructive, not a merge. Notes, files, settings and account credentials are replaced; all devices must sign in again with the restored password and MFA. Destination domain and unrelated server backups are kept.',
  'restore.help2':
    'Unsaved editor content is not backed up or restored. Restart discards unconfirmed uploads. If restore fails, the previous state is rolled back; see the operator restore runbook if startup requires recovery.',
  'restore.archiveLabel': 'PandaNote backup archive',
  'restore.upload': 'Upload and validate backup',
  'restore.replace': 'Replace application from backup',
  'restore.discard': 'Discard validated upload',
  'restore.summaryTitle': 'Validated archive summary',
  'restore.captured':
    'Captured {date} · schema {schema} · {bytes} archive bytes',
  'restore.counts':
    '{notes} notes: {published} notes, {trash} Trash. {attachments} attachments.',
  'restore.mfa':
    'Restored account MFA: {state}. Use the archived account credentials after replacement.',
  'restore.progressUpload': 'Uploading archive: {loaded} of {total} bytes',
  'restore.progressValidate':
    'Validating checksums, database, keys, references and staged search. Current data is unchanged.',
  'restore.interrupted':
    'Archive upload interrupted. Current data is unchanged; select the archive and retry.',
  'restore.invalidArchive': 'Invalid archive.',
  'restore.requestFailed': 'Restore request failed.',
  'restore.securityFailed': 'Could not load security state.',
  'restore.pickFile': 'Select a supported-size PandaNote .pnb archive.',
  'restore.validated':
    'Archive validated. Nothing has been replaced. Inspect the summary before confirming.',
  'restore.replacing':
    'Replacing application data. Wait for completion; all sessions will be invalidated.',
  'restore.uploadFirst': 'Upload and validate an archive first.',
  'restore.connectionSuffix':
    ' If the connection was lost, sign in to check the result before retrying. A successful restore requires the archived account.',
  'restore.discarded': 'Validated upload discarded. Current data is unchanged.',
  'restore.discardFailed': 'Could not discard upload.',
  'restore.authUploadTitle': 'Authorize restore upload',
  'restore.authReplaceTitle': 'Confirm full restore',
  'restore.authUploadHelp':
    'Authorize private upload and validation. Current application data will not change.',
  'restore.authReplaceHelp':
    'This replaces all current application data, including your password and MFA configuration. It does not merge notes. All active sessions will be invalidated.',
  'restore.understand':
    'I understand that current application data will be replaced.',
  'restore.password': 'Current password for restore',
  'restore.code': 'Current authenticator or recovery code for restore',
  'restore.working': 'Working…',
  'restore.confirmUpload': 'Confirm upload and validate',
  'restore.confirmReplace': 'Confirm replace all application data',
  'restore.authorizing': 'Authorizing…',
  'backup.requestFailed': 'Backup request failed. Refresh before retrying.',
  'backup.loadFailed': 'Could not load backups. Retry refresh.',
  'backup.storageUnavailable':
    'Browser retry storage is unavailable. Backup creation will not send until retry identity can be retained.',
  'backup.started':
    'Manual backup started. It is downloadable only after verification completes.',
  'backup.connection':
    'Connection failed. Refresh the backup list before retrying.',
  'backup.downloadRequested':
    'Download requested. Check browser downloads; any server error opens separately.',
  'backup.deleted': 'Backup or failed job deleted.',
  'backup.heading': 'Backup & Restore',
  'backup.warning':
    'Archives are unencrypted and contain private notes, files, password hashes, MFA secrets, recovery-code hashes and portable authentication keys. Keep them protected. There is no separate backup password.',
  'backup.help':
    'Only manual full backups are created. A server-local copy does not protect against losing the VPS: download it and keep it safely elsewhere. Unsaved editor text and files are not included. Uploaded restores replace application data only after validation and explicit fresh-auth confirmation.',
  'backup.retryRequest': 'Retry backup request',
  'backup.create': 'Create full backup',
  'backup.refresh': 'Refresh backups',
  'backup.none': 'No server backups yet.',
  'backup.listHelp':
    'Newest 100 jobs. Snapshot capture briefly pauses mutations; reading remains available. Interrupted jobs fail rather than resume automatically.',
  'backup.download': 'Download backup',
  'backup.delete': 'Delete backup',
  'backup.failed':
    'Failed: {code}. Free space if needed, refresh, then create a new backup.',
  'backup.bytes': ' · {bytes} bytes',
  'backup.stateLabel': 'Backup state',
  'backup.state.pending': 'pending',
  'backup.state.capturing': 'capturing',
  'backup.state.archiving': 'archiving',
  'backup.state.complete': 'complete',
  'backup.state.failed': 'failed',
  'backup.deleteTitle': 'Delete backup?',
  'backup.deleteHelp':
    'Permanently delete this server backup or failed job? Downloaded copies are not deleted.',
  'backup.deleting': 'Deleting…',
  'backup.confirmDelete': 'Confirm delete backup',
  'conflict.title': 'Note conflict',
  'conflict.help':
    'The server changed. Nothing has been overwritten. Your local text and new file blobs are retained on this device.',
  'conflict.serverVersion': 'Server version · revision {revision} · {status}',
  'conflict.timeline': 'Timeline: {time}',
  'conflict.localRetained': 'Your retained local version',
  'conflict.loadServer': 'Load server version',
  'conflict.saveSeparate': 'Save local as separate note',
  'conflict.replaceRevision': 'Explicitly replace revision {revision}',
  'conflict.keepLocal': 'Keep local edits',
  'conflict.restoreFirst':
    'Restore the server note before replacing or editing it. You can publish your local version separately.',
  'conflict.confirmTitle': 'Confirm conflict resolution',
  'conflict.confirmReplace':
    'Replace server revision {revision} with your local version? A newer revision will conflict again, never be forced over.',
  'conflict.confirmCopy':
    'Publish your local version as a separate note? Existing server attachments can be shared safely.',
  'conflict.confirmTrash': 'View the current server version in Trash?',
  'conflict.confirmLoad': 'Load the current server version into the editor?',
  'conflict.discardNote':
    'Loading the server version discards the losing edits. An uncertain previous save is not canceled. Keep editing or copy the text first if needed.',
  'conflict.actReplace': 'replace',
  'conflict.actCopy': 'separate note',
  'conflict.actLoad': 'load server',
  'conflict.confirmAction': 'Confirm {action}',
  'monthpicker.dialog': 'Choose year and month',
  'monthpicker.prevYear': 'Previous year',
  'monthpicker.nextYear': 'Next year',
  'monthpicker.year': 'Year',
  'monthpicker.enterYear': 'Enter year, {year}',
  'monthpicker.months': 'Months in {year}',
  'monthpicker.range': 'Enter a year between {min} and {max}.',
  'monthpicker.m1': 'Jan',
  'monthpicker.m2': 'Feb',
  'monthpicker.m3': 'Mar',
  'monthpicker.m4': 'Apr',
  'monthpicker.m5': 'May',
  'monthpicker.m6': 'Jun',
  'monthpicker.m7': 'Jul',
  'monthpicker.m8': 'Aug',
  'monthpicker.m9': 'Sep',
  'monthpicker.m10': 'Oct',
  'monthpicker.m11': 'Nov',
  'monthpicker.m12': 'Dec',
  'modal.closeNamed': 'Close {title}',
  'modal.close': 'Close',
  'editor.options': 'Note options',
  'editor.addTag': 'Add tag',
  'editor.tags': 'Tags',
  'editor.addMedia': 'Add photos or video',
  'editor.mediaTitle': 'Photos or video',
  'editor.addFile': 'Attach file',
  'editor.fileTitle': 'Attach file',
  'editor.setDate': 'Set date',
  'editor.dateTitle': 'Date',
  'unsaved.title': 'Unsaved changes',
  'unsaved.help':
    'You have unsaved changes. Do you want to post/save your changes, discard them, or cancel?',
  'unsaved.frozen':
    'This save may already have succeeded. Discard only abandons this editor; it does not undo a server save.',
  'unsaved.saveChanges': 'Save changes',
  'unsaved.post': 'Post',
  'unsaved.discard': 'Discard',
  'lifecycle.titlePermanent': 'Permanently delete note?',
  'lifecycle.titleRestore': 'Restore note?',
  'lifecycle.titlePin': 'Pin note?',
  'lifecycle.titleUnpin': 'Unpin note?',
  'lifecycle.titleTrash': 'Move to Trash?',
  'lifecycle.descPermanent':
    'Permanently remove this note and any files no other note references. This cannot be undone.',
  'lifecycle.descRestore':
    'Return this note to notes, preserving dates and files.',
  'lifecycle.descPin': 'Keep this note at the top of All notes.',
  'lifecycle.descUnpin': 'Return this note to its date position.',
  'lifecycle.descTrash':
    'Keep this note and files in Trash. It disappears from notes, search and calendar.',
  'lifecycle.serverNow':
    'The server is now {status}, revision {revision}. Close and refresh the list before confirming a new action.',
  'lifecycle.inspect': 'Inspect server note',
  'lifecycle.refreshServer': 'Refresh server version',
  'lifecycle.saving': 'Saving…',
  'lifecycle.retrySame': 'Retry same action',
  'lifecycle.confirmPermanent': 'Confirm permanent delete',
  'lifecycle.confirmRestore': 'Confirm restore',
  'lifecycle.confirmPin': 'Confirm pin',
  'lifecycle.confirmUnpin': 'Confirm unpin',
  'lifecycle.confirmMove': 'Confirm move',
  'lifecycle.stopNote':
    'Stopping retries does not undo or cancel an action that may already have succeeded.',
  'lifecycle.stop': 'Stop retrying this action',
  'feedback.uploadProgress': 'File upload progress',
  'feedback.signIn': 'Sign in again to save this note',
  'feedback.frozen':
    'This save is frozen for safe retry. It may already have committed. Retry first; starting a new attempt does not cancel or undo the original.',
  'feedback.checkRetry': 'Check and retry save',
  'feedback.editNew': 'Edit as new note',
  'feedback.compare': 'Compare server version (revision {revision})',
  'feedback.keepEditing':
    'Your current text is retained. Resolve the conflict or keep editing.',
  'attach.list': 'Attachments ({count})',
  'attach.fileList': 'Files ({count})',
  'attach.tile':
    '{name}, {index} of {total}. Press Alt plus an arrow key to move.',
  'attach.remove': 'Remove {name}',
  'attach.removeTitle': 'Remove',
  'attach.repair': 'Repair {name}',
  'attach.missing':
    'Missing file — choose the original or remove it. Posting must wait.',
  'thumb.list': 'Note images',
  'thumb.open': 'Open image {index}: {name}',
  'date.button': 'Date',
  'date.title': 'Timeline date',
  'date.save': 'Save',
  'date.chip': 'Timeline date: {when}',
  'date.label': 'Timeline date/time ({timezone})',
  'date.invalid':
    'Choose a valid, unambiguous date/time that is now or earlier.',
  'calendar.previousMonth': 'Previous month',
  'calendar.nextMonth': 'Next month',
  'calendar.today': 'Today',
  'calendar.activityIn': 'Activity in {month}',
  'calendar.unavailable': 'activity unavailable',
  'calendar.publishedOne': '{count} published note',
  'calendar.publishedMany': '{count} published notes',
  'calendar.todaySuffix': ', today',
  'calendar.selectedSuffix': ', selected; clear day filter',
  'calendar.loading': 'Loading activity…',
  'calendar.retry': 'Retry activity',
  'calendar.monday': 'Monday',
  'calendar.tuesday': 'Tuesday',
  'calendar.wednesday': 'Wednesday',
  'calendar.thursday': 'Thursday',
  'calendar.friday': 'Friday',
  'calendar.saturday': 'Saturday',
  'calendar.sunday': 'Sunday',
  'calset.help':
    'One saved app timezone groups note dates on every device. Travelling or changing the browser/VPS timezone will not change it. New notebooks use UTC until you choose.',
  'calset.timezone': 'App timezone',
  'calset.useBrowser': 'Use browser timezone ({zone})',
  'calset.weekStart': 'Week starts on',
  'calset.saving': 'Saving calendar…',
  'calset.save': 'Save calendar',
  'calset.invalid': 'Enter a valid IANA timezone, such as Asia/Hong_Kong.',
  'calset.failed': 'Could not save calendar settings.',
  'calset.saved': 'Calendar saved. Dates and counts now use this timezone.',
  'calset.network':
    'Could not save calendar settings. Your choices remain; retry.',
  'note.changed':
    'This note changed. Refresh the timeline before expanding it.',
  'note.loadFailed': 'Note could not be loaded. Retry Show more.',
  'note.searchExcerpts': 'Search excerpts (normalized text)',
  'note.searchExcerptsHelp': 'Search excerpts · normalized text',
  'note.snippetSource': 'Source',
  'note.snippetTag': 'Tag',
  'note.snippetFile': 'Filename',
  'note.preview': 'Long note preview · full content loads on expansion.',
  'note.loadingFull': 'Loading full note…',
  'note.showLess': 'Show less',
  'note.showMore': 'Show more',
  'note.refresh': 'Refresh',
  'note.attachments': 'Attachments',
  'note.voiceClips': 'Voice clips',
  'note.downloadClip': 'Download {name}',
  'note.bytes': '{count} bytes',
  'note.kilobytes': '{value} KB',
  'note.megabytes': '{value} MB',
  'note.savedOnServer': 'Saved on server.',
  'note.detail': 'Note detail',
  'editor.editNote': 'Edit note',
  'editor.writeNote': 'Write a note',
  'editor.saving': 'Saving…',
  'editor.retrySave': 'Retry save',
  'editor.noteText': 'Note text',
  'editor.discardGroup': 'Discard changes?',
  'editor.discardText': 'Discard your changes?',
  'editor.keepEditing': 'Keep editing',
  'editor.editingStatus': 'Editing note · save with Save changes.',
  'editor.notSaved': 'Not saved yet. Keep a copy before leaving.',
  'editor.chooseFiles': 'Choose local files',
  'editor.chooseAnyFile': 'Choose any file',
  'editor.preview': 'Preview',
  'editor.showRaw': 'Show raw text',
  'editor.previewMarkdown': 'Preview Markdown',
  'editor.enterFocus': 'Enter focus mode',
  'editor.closeFocus': 'Close focus mode',
  'editor.focusMode': 'Focus mode',
  'shell.resize': 'Resize sidebar',
  'shell.resizeTitle': 'Drag to resize sidebar; use arrow keys when focused',
  'shell.pixels': '{width} pixels',
  'shell.widthStorageUnavailable':
    'Browser session storage is unavailable. The sidebar width may reset on refresh.',
  'shell.removeSearch': 'Remove search filter',
  'shell.removeDay': 'Remove day filter',
  'shell.searchChip': 'Search: {query} ×',
  'shell.selectedDay': 'Selected day',
  'shell.notesPane': 'Notes pane',
  'shell.backTop': 'Back to Top ↑',
  'search.checkQuery': 'Check the search query.',
  'tag.noteOne': '{count} note',
  'tag.noteMany': '{count} notes',
  'tag.trashCount': '{count} in Trash',
  'tag.name': 'Tag name',
  'tag.mergeInto': 'Merge into',
  'tag.previewChanges': 'Preview tag changes',
  'tag.removed': 'removed',
  'tag.counts':
    '{published} notes · {trash} Trash notes will receive new revisions. In-progress editors will conflict.',
  'tag.mergeNote':
    'The existing target spelling is retained; duplicate note joins are collapsed.',
  'tag.retired':
    'The target was retired before. Reusing it does not erase history; local posts using it require explicit acknowledgement.',
  'tag.previewHelp':
    'Removal deletes only the hashtag token, preserving adjacent spaces. Notes are not deleted. Below are up to 10 source excerpts; all counted notes are affected.',
  'tag.inspect': 'Inspect full note',
  'tag.sample': '{status} · revision {revision} ·',
  'tag.back': 'Back',
  'tag.confirmAction': 'Confirm {action}',
  'tag.actRename': 'rename',
  'tag.actMerge': 'merge',
  'tag.actRemove': 'remove',
  'pending.aria': 'Unconfirmed tag operations',
  'pending.heading': 'Unconfirmed tag operations · this browser',
  'pending.help':
    'Retry to check the original result. Stopping a retry does not cancel or undo a server operation.',
  'pending.check': 'Check and retry tag operation',
  'pending.stop': 'Stop retrying',
  'pending.stopConfirm':
    'Stop retrying? This does not cancel or undo the server operation.',
  'stale.title': 'Review retired tags',
  'stale.help':
    'Your local source and files are unchanged. Choose how to handle tags that were renamed, merged or removed.',
  'stale.item': '#{tag} → {target} · history {generation}',
  'stale.frozen': 'This save is frozen. A resolution creates an editable copy.',
  'stale.history': 'Apply rename/removal history locally',
  'stale.removeLocal': 'Remove these hashtags locally',
  'stale.recreate': 'Intentionally keep or recreate retired tags',
  'stale.recreateConfirm':
    'Intentionally keep or recreate these retired tags? This does not undo management changes on other notes.',
  'stale.nothingPosts':
    'Nothing posts automatically. Review your source and explicitly Post or Save changes. Another tag change will require a new review.',
  'tagauto.existing': 'Existing tags',
  'search.filter': 'Search syntax help',
  'search.help':
    'Words must all match. Use OR, NOT (capitals) and ( ) to combine, and tag:name for an exact tag. Put text in double quotes to match it literally, such as "a OR b" or "f(x)".',
  'rec.errInsecure': 'Recording needs a secure (HTTPS) connection.',
  'rec.errUnsupported': 'This browser cannot record audio.',
  'rec.errDenied':
    'Microphone access was denied. Allow it in your browser settings and try again.',
  'rec.errNoDevice': 'No microphone was found.',
  'rec.errBusy': 'The microphone is in use by another app or tab.',
  'rec.errFailed': 'Recording failed.',
  'rec.errFailedKept':
    'Recording stopped unexpectedly. What was captured has been kept.',
  'rec.errEmpty': 'Nothing was recorded.',
  'rec.errShort': 'The recording was too short, so no clip was added.',
  'rec.limitReached': 'Recording stopped at {time}. The clip was added.',
  'rec.sizeReached':
    'Recording reached the file size limit. The clip was added.',
  'rec.maxClips': 'You can add at most {count} voice clips to one note.',
  'rec.videoClips': 'A note with a video cannot also have voice clips.',
  'rec.tooLarge': 'The recording exceeds the {size} MiB size limit.',
  'rec.stopFirst': 'Stop recording first',
  'rec.start': 'Record a voice clip',
  'rec.startTitle': 'Voice clip',
  'rec.strip': 'Voice recorder',
  'rec.waiting': 'Waiting for the microphone…',
  'rec.recording': 'Recording',
  'rec.paused': 'Paused',
  'rec.level': 'Microphone level',
  'rec.pause': 'Pause',
  'rec.resume': 'Resume',
  'rec.stop': 'Stop and add clip',
  'rec.cancel': 'Discard take',
  'rec.announceStarted': 'Recording started',
  'rec.announcePaused': 'Recording paused',
  'rec.announceResumed': 'Recording resumed',
  'rec.announceAdded': 'Voice clip added',
  'rec.announceDiscarded': 'Recording discarded',
  'rec.clips': 'Voice clips ({count})',
  'rec.clip':
    'Voice clip {index} of {total}. Press Alt plus an arrow key to move.',
  'rec.quiet': 'No sound detected. Check that your microphone is not muted.',
  'rec.silentClip':
    'No sound was captured in this clip. Check your microphone.',
  'rec.name': 'Clip name',
  'rec.nameHint': 'Name this clip',
  'rec.nameSave': 'Save name',
  'rec.rename': 'Rename {name}',
  'rec.renameTitle': 'Rename',
  'rec.renameCancel': 'Cancel renaming',
  'rec.renameFailed': 'The clip could not be renamed. Try again.',
  'rec.play': 'Play {name}',
  'rec.pausePlay': 'Pause {name}',
  'work.maxFiles': 'You can attach at most {count} files to one note.',
  'work.oneVideo': 'A note can have only one video.',
  'work.videoMix':
    'A video cannot be combined with photos or other files. Remove them first.',
  'work.videoPhotos': 'A note with a video cannot also have photos.',
  'work.maxPhotos': 'You can add at most {count} photos to one note.',
  'work.addFailed': 'Files could not be added. Keep the originals and retry.',
  'work.sizeMismatch': 'File size does not match {name}.',
  'work.stagePreparing': 'Preparing save…',
  'work.fileMissing': 'File {name} is missing.',
  'work.reviewTags': 'Review retired tags before retrying.',
  'work.baseChanged':
    'The server base changed. Compare the server version before replacing it.',
  'work.saveFailed': 'Save failed.',
  'work.retiredChoice': 'Retired tags need an explicit choice.',
  'work.openFailed': 'Could not open the editor.',
  'work.conflictFailed':
    'Conflict resolution could not finish. Your editor and files are retained; retry.',
  'life.unreadable':
    'A saved action retry could not be read. Its bytes are preserved. Inspect server notes before trying again.',
  'life.storageUnavailable':
    'Browser action storage is unavailable. Keep your work and retry.',
  'life.tooMany': 'Too many unconfirmed actions. Resolve saved retries first.',
  'life.storageFailed': 'Browser storage failed. The saved retry is retained.',
  'life.notSent':
    'The action was not sent: browser retry storage failed. Free browser storage and retry, or inspect the server version.',
  'life.interrupted': 'Action interrupted.',
  'tagops.unreadable':
    'An unreadable tag retry was retained. Keep a copy and inspect browser storage.',
  'tagops.storageUnavailable':
    'Tag retry storage is unavailable. No new action can be sent safely.',
  'tagops.previewFailed': 'Preview failed. Nothing changed.',
  'tagops.confirmUnavailable':
    'Confirmation unavailable. Retry this exact operation; your notes are protected.',
  'cal.loadFailed': 'Activity could not be loaded. Retry.',
  'attempt.invalid': 'Invalid frozen posting attempt',
  'date.future': 'Timeline date must be now or earlier.',
  'proto.unexpected': 'Unexpected response',
  'proto.interrupted': 'Upload interrupted',
  'proto.unexpectedUpload': 'Unexpected upload response',
  'proto.damaged':
    'Frozen payload is damaged. Keep this editor and start a new editable attempt.',
  'proto.checking': 'Checking previous save…',
  'proto.unrecognized':
    'The server no longer recognizes this confirmed save (possibly after restore). The current editor was kept. Check the server before posting a copy.',
  'proto.bytesMissing':
    'Original local bytes for {name} are missing or changed. Retry after repairing the original, or edit a separate copy.',
  'proto.uploading': 'Uploading {name}…',
  'proto.processing': 'Processing {name}…',
  'proto.notReady': 'Upload not ready',
  'proto.savingComplete': 'Saving complete note…',
  'mermaid.tooLarge':
    'Diagram is too large. Use at most 12,000 characters, 160 lines and 300 connections.',
  'mermaid.disabled':
    'Diagram links, HTML, styles, assets and configuration directives are disabled.',
  'mermaid.invalidOutput': 'Invalid diagram output.',
  'mermaid.timeout': 'Diagram rendering timed out.',
  'mermaid.rendering': 'Rendering diagram…',
  'mermaid.invalid': 'Invalid Mermaid diagram. Check its syntax in Write.',
  'model.completeSnapshot': 'Editing requires a complete server snapshot.',
  'model.restoreFirst': 'Restore this note before editing it.',
  'model.metadataIncomplete':
    'Attachment metadata is incomplete. Reload the note before editing.',
  'markdown.previewFailed':
    'Preview could not be rendered. Reduce the note size and try again; your text is unchanged.',
  'markdown.openImage': 'Open image: {name}',
  'markdown.noteImage': 'note image',
  'markdown.showMoreCopy': 'Show more to copy the complete original code.',
  'markdown.codeCopied': 'Code copied.',
  'markdown.copyFailedSelect': 'Copy failed — select code',
  'markdown.copyFailed': 'Copy failed. Select the code and copy manually.',
  'route.unconfirmed': 'Unconfirmed note actions',
  'route.unconfirmedHeading': 'Unconfirmed note actions · this browser',
  'route.unconfirmedHelp':
    'These actions may already have succeeded. Retry the exact saved command to check safely, even after reload.',
  'route.review': 'Review {action} · {id}',
  'trash.search': 'Search trash',
  'tags.search': 'Search tags',
  'tags.none': 'No tags',
  'tags.retry': 'Retry',
  'note.title': 'Note',
  'composer.continue': 'Continue writing',
  'composer.compose': 'Compose a note',
  'life.notOverwritten':
    ' No newer revision was overwritten. The exact retry is kept on this browser; inspect the server version or retry safely.',
  'markdown.copy': 'Copy',
  'markdown.diagram': 'Mermaid diagram',
  'markdown.diagramWaiting': 'Diagram waiting until visible…',
  'markdown.copyCode': 'Copy {language} code',
  'markdown.copied': 'Copied!',
  'validation.passwordMax': 'Use at most 128 characters.',
  'validation.passwordLength': 'Use 8–128 characters.',
  'validation.username':
    'Use 3–32 characters: a–z, 0–9, dot, underscore or hyphen.',
  'validation.email': 'Enter an email address with a dotted domain.',
  'validation.setupCode': 'Enter the setup code from the server log.',
  'validation.passwordMatch': 'Passwords must match exactly.',
  'validation.siteTitle': 'Use 1–60 characters without control characters.',
  'validation.tagline': 'Use up to 60 characters without control characters.',
  'validation.timezone': 'Use a valid IANA timezone',

  // Server API and page-loader errors (stable keys carried in ApiError.messageKey).
  'err.restoreMaintenance':
    'Restore maintenance is in progress. Retry shortly.',
  'err.sameOrigin': 'Same-origin request required.',
  'err.finishSetup': 'Finish setup to continue.',
  'err.authUnavailable':
    'Authentication is temporarily unavailable. Please retry.',
  'err.attachmentRequestFailed':
    'Attachment request failed. Keep your local files and retry.',
  'err.noteSaveFailed':
    'Note could not be saved. Keep your local work and retry.',
  'err.appearanceSaveFailed':
    'Appearance settings could not be saved. Please retry.',
  'err.checkFields': 'Check the highlighted fields.',
  'err.unexpectedFields': 'Unexpected fields.',
  'err.setupCodeWrong':
    'Setup code is incorrect. Use the newest code from the server log.',
  'err.tagsLoadFailed': 'Tags could not be loaded. Retry.',
  'err.activityLoadFailed': 'Activity could not be loaded. Retry in a moment.',
  'err.notesLoadFailed': 'Notes could not be loaded. Retry in a moment.',
  'err.trashLoadFailed': 'Trash could not be loaded. Retry in a moment.',
  'err.trashPageLoadFailed':
    'Trash could not be loaded. No notes were removed. Retry in a moment.',
  'err.calendarSettingsSaveFailed':
    'Calendar settings could not be saved. Retry.',
  'err.generalSettingsSaveFailed':
    'General settings could not be saved. Retry.',
  'err.storageMeasureFailed':
    'Storage could not be measured. Retry refreshing storage.',
  'err.storageLimitsSaveFailed':
    'Storage limits could not be saved. Your choices remain; retry.',
  'err.cleanupFailed':
    'Cleanup could not finish. Refresh storage and retry; queued deletion is retained for restart recovery.',
  'err.tagOperationUnconfirmed':
    'Tag operation could not be confirmed. Retry the same operation safely.',
  'err.tagHistoryCheckFailed':
    'Tag history could not be checked. Editor retained; retry.',
  'err.tagPreviewFailed': 'Tag preview failed. No changes made; retry.',
  'err.rateLimited': 'Too many attempts. Try again in 15 minutes.',
  'err.mfaRateLimited':
    'Too many incorrect codes today. Sign in from a device you used before, or try again tomorrow.',
  'err.noteLoadFailed': 'This note could not be loaded. Retry in a moment.',
  'err.noteNotFoundShort': 'Note not found.',
  'err.noteChangedCompare':
    'The note has changed. Keep your local edits and compare the server version.',
  'err.preReleaseBackup':
    'This backup was created by a pre-release PandaNote and cannot be restored. Start with an empty instance and create a new backup.',
  'err.pinLimit': 'You can pin at most {max} notes. Unpin one first.',
  'err.missingUploadBody': 'Missing upload body.',
  'err.uploadTimedOutKeepYour':
    'Upload timed out. Keep your local file and retry.',
  'err.uploadExceedsThePermittedByte':
    'Upload exceeds the permitted byte limit or frozen input size.',
  'err.uploadIsIncompleteRetryWith':
    'Upload is incomplete. Retry with the original file.',
  'err.useAJsonUploadManifest': 'Use a JSON upload manifest.',
  'err.uploadManifestTimedOutRetry':
    'Upload manifest timed out. Retry the posting attempt.',
  'err.uploadManifestIsTooLarge': 'Upload manifest is too large.',
  'err.invalidUploadManifest': 'Invalid upload manifest.',
  'err.imageProcessorCouldNotStart':
    'Image processor could not start. Retry the upload.',
  'err.imageProcessingTimedOutTry':
    'Image processing timed out. Try a smaller image.',
  'err.animatedImagesAreNotSupported':
    'Animated images are not supported. Select a static image.',
  'err.imageExceedsTheDecodedPixel': 'Image exceeds the decoded pixel limit.',
  'err.imageIsCorruptOrUses': 'Image is corrupt or uses an unsupported format.',
  'err.imageProcessingFailedRetryWith':
    'Image processing failed. Retry with a valid static image.',
  'err.notEnoughDiskSpaceAbove':
    'Not enough disk space above the safety reserve. Free space and retry.',
  'err.imageProcessingIsBusyRetry':
    'Image processing is busy. Retry this upload shortly.',
  'err.imageQueueTimedOutRetry': 'Image queue timed out. Retry this upload.',
  'err.invalidAttachmentOrBatchId': 'Invalid attachment or batch ID.',
  'err.thisRetryHasDifferentFiles':
    'This retry has different files or content. Start a new posting attempt.',
  'err.uploadBatchNotFound': 'Upload batch not found.',
  'err.invalidFrozenUploadManifestCheck':
    'Invalid frozen upload manifest. Check IDs, filenames, sizes and checksums.',
  'err.theUploadManifestExceedsThe':
    'The upload manifest exceeds the attachment limits.',
  'err.thisBatchIsNoLonger':
    'This batch is no longer accepting uploads. Start a new posting attempt.',
  'err.tooManyPendingPostingAttempts':
    'Too many pending posting attempts. Clean unused uploads in Storage settings before retrying.',
  'err.thisBatchIsNotAccepting': 'This batch is not accepting uploads.',
  'err.uploadItemNotFound': 'Upload item not found.',
  'err.uploadSizeDoesNotMatch': 'Upload size does not match the frozen file.',
  'err.svgIsSupportedOnlyAs':
    'SVG is supported only as a downloadable file. Upload it as application/octet-stream.',
  'err.fileExceedsTheUploadByte': 'File exceeds the upload byte limit.',
  'err.uploadsAreBusyQueryReadiness':
    'Uploads are busy. Query readiness and retry shortly.',
  'err.theUploadIsNotA': 'The upload is not a supported raster image.',
  'err.theVoiceClipIsNot':
    'The voice clip is not a supported audio recording (webm, mp4 or ogg).',
  'err.uploadReadinessChangedRetryThe':
    'Upload readiness changed. Retry the posting attempt.',
  'err.fileExceedsTheByteLimit': 'File exceeds the byte limit.',
  'err.theDiskIsFullFree':
    'The disk is full. Free space and retry; your local files are still needed.',
  'err.uploadCouldNotBeStored':
    'Upload could not be stored. Keep the local file and retry.',
  'err.confirmTheSelectedUnusedPosting':
    'Confirm the selected unused posting attempts.',
  'err.aSelectedAttemptIsActive':
    'A selected attempt is active, recently resumed, or referenced. Refresh storage before choosing again. Nothing from this selection was queued.',
  'err.attachmentNotFound': 'Attachment not found.',
  'err.invalidClipName': 'That name cannot be used for a voice clip.',
  'err.onlyVoiceClipsRenamed': 'Only voice clips can be renamed.',
  'err.attachmentVariantNotFound': 'Attachment variant not found.',
  'err.storedAttachmentIsUnavailable': 'Stored attachment is unavailable.',
  'err.useAnApplicationJsonRequest': 'Use an application/json request.',
  'err.authenticationRequestIsTooLarge': 'Authentication request is too large.',
  'err.missingRequestBody': 'Missing request body.',
  'err.invalidAuthenticationRequest': 'Invalid authentication request.',
  'err.signInAgainThenRetry':
    'Sign in again, then retry with your retained local work.',
  'err.authenticationIsBusyPleaseRetry':
    'Authentication is busy. Please retry.',
  'err.invalidClientAddress': 'Invalid client address.',
  'err.invalidProxyClientAddress': 'Invalid proxy client address.',
  'err.setupHasTimedOutRestart':
    'Setup has timed out. Restart PandaNote on the server to open it again (docker compose restart pandanote).',
  'err.enterYourPasswordAgain': 'Enter your password again.',
  'err.authenticateAgainForThisAction': 'Authenticate again for this action.',
  'err.enableMfaFirst': 'Enable MFA first.',
  'err.use130Days': 'Use 1–30 days.',
  'err.restoreRecoveryIsPendingRestart':
    'Restore recovery is pending. Restart PandaNote before resetting the password.',
  'err.applicationDataChangedDuringPassword':
    'Application data changed during password reset. Run reset-password again.',
  'err.noAccountExists': 'No account exists.',
  'err.useAProtectedDownloadForm': 'Use a protected download form.',
  'err.downloadFormIsTooLarge': 'Download form is too large.',
  'err.invalidDownloadForm': 'Invalid download form.',
  'err.restoreWorkIsInProgress':
    'Restore work is in progress. Wait before discarding.',
  'err.aRestoreUploadOrReplacement':
    'A restore upload or replacement is already running.',
  'err.invalidOrOversizedArchiveByte':
    'Invalid or oversized archive byte count.',
  'err.notEnoughDiskSpaceFor':
    'Not enough disk space for restore staging. Free space and retry.',
  'err.archiveIsCorruptIncompatibleUnsafe':
    'Archive is corrupt, incompatible, unsafe, or exceeds restore validation limits. Current data is unchanged.',
  'err.explicitlyConfirmFullReplacement':
    'Explicitly confirm full replacement.',
  'err.waitUntilBackupOrRestore': 'Wait until backup or restore work finishes.',
  'err.restoreCleanupRecoveryIsPending':
    'Restore cleanup/recovery is pending. Restart the application before another restore.',
  'err.validatedRestoreIsUnavailableUpload':
    'Validated restore is unavailable. Upload again; restart discards unconfirmed uploads.',
  'err.backupInventoryNeedsOperatorInspection':
    'Backup inventory needs operator inspection.',
  'err.restoreRecoveryRequiresApplicationRestart':
    'Restore recovery requires application restart or operator inspection. Retained data and journal must not be deleted.',
  'err.restoreFailedAndThePrevious':
    'Restore failed and the previous application was restored. Upload again to retry.',
  'err.invalidBackupRequest': 'Invalid backup request.',
  'err.thisBackupIdentityAlreadyHas':
    'This backup identity already has an archive. Refresh the list.',
  'err.aBackupIsAlreadyRunning':
    'A backup is already running. Refresh its status.',
  'err.backupHistoryIsFullDelete':
    'Backup history is full. Delete old backups or failed jobs first.',
  'err.tooManyFilesForThis': 'Too many files for this backup format.',
  'err.notebookExceedsThisBackupFormat':
    'Notebook exceeds this backup format’s size limit.',
  'err.backupNotFound': 'Backup not found.',
  'err.invalidBackupDownloadRequest': 'Invalid backup download request.',
  'err.completedBackupNotFound': 'Completed backup not found.',
  'err.invalidBackupId': 'Invalid backup ID.',
  'err.confirmBackupDeletion': 'Confirm backup deletion.',
  'err.waitUntilThisBackupFinishes': 'Wait until this backup finishes.',
  'err.snapshotProcessorCouldNotStart':
    'Snapshot processor could not start. Retry backup.',
  'err.notEnoughDiskSpaceFor2':
    'Not enough disk space for snapshot processing. Free space and retry.',
  'err.snapshotProcessingFailedOrTimed':
    'Snapshot processing failed or timed out. Retry backup.',
  'err.thisRetryHasDifferentContent':
    'This retry has different content. Start a new posting attempt.',
  'err.theAttachmentIsStillReferenced': 'The attachment is still referenced.',
  'err.maintenanceIsInProgressPlease':
    'Maintenance is in progress. Please retry.',
  'err.writeLeaseHasExpired': 'Write lease has expired.',
  'err.maintenanceLeaseHasExpired': 'Maintenance lease has expired.',
  'err.activeWritesDidNotFinish': 'Active writes did not finish. Please retry.',
  'err.everyMarkdownImageMustReference':
    'Every Markdown image must reference a ready image in this note. Repair or remove unavailable images before posting.',
  'err.aNormalizedTagExceeds64': 'A normalized tag exceeds 64 characters.',
  'err.checkTheMarkdownSizeAnd':
    'Check the Markdown size and hashtag limits (64 characters per tag, 100 unique tags).',
  'err.useAnApplicationJsonNote': 'Use an application/json note request.',
  'err.noteRequestIsTooLarge': 'Note request is too large.',
  'err.noteRequestTimedOutKeep':
    'Note request timed out. Keep your local work and retry.',
  'err.invalidJsonNoteRequest': 'Invalid JSON note request.',
  'err.noteNotFoundKeepYour':
    'Note not found. Keep your unsaved editor open if you need its text or files.',
  'err.invalidNoteId': 'Invalid note ID.',
  'err.invalidNoteActionContentDate':
    'Invalid note action, content, date, attachments or expected revision.',
  'err.thisNoteCannotAcceptAnother':
    'This note cannot accept another revision. Save a separate copy.',
  'err.thisPostingAttemptDoesNot':
    'This posting attempt does not match its frozen upload batch. Start a new attempt.',
  'err.aStatusActionCannotCommit':
    'A status action cannot commit an upload batch.',
  'err.publishedNotesUseSaveChanges':
    'Published notes use Save changes; Trash must be restored first.',
  'err.keepTheOriginalTimelineDate':
    'Keep the original timeline date or explicitly choose a new one.',
  'err.thisNoteExceedsTheConfigured':
    'This note exceeds the configured text or attachment limit.',
  'err.addTextOrAReady': 'Add text or a ready image/file before posting.',
  'err.allFrozenBatchFilesMust':
    'All frozen batch files must be included. Start a new attempt to change the file selection.',
  'err.moveTheNoteToTrash':
    'Move the note to Trash before permanently deleting it.',
  'err.onlyAnUnpinnedPublishedNote':
    'Only an unpinned published note can be pinned.',
  'err.thisNoteIsNotPinned': 'This note is not pinned.',
  'err.anAttachmentIsMissingUnready':
    'An attachment is missing, unready or unavailable to this posting attempt. Keep your local files and retry.',
  'err.aStoredAttachmentIsUnavailable':
    'A stored attachment is unavailable. Repair or remove it before saving; your local work is retained.',
  'err.invalidCursorOrDifferentStatus':
    'Invalid cursor or different status. Refresh this list.',
  'err.invalidTimelineCursorStartFrom':
    'Invalid timeline cursor. Start from the first page.',
  'err.thisCursorBelongsToDifferent':
    'This cursor belongs to different filters or timezone. Start from the first page.',
  'err.chooseValidAppearanceSettings': 'Choose valid appearance settings.',
  'err.chooseASiteTitleOf':
    'Choose a site title of 1–60 characters and an available language.',
  'err.chooseAValidIanaTimezone':
    'Choose a valid IANA timezone and week start.',
  'err.chooseValidUploadImageAnd':
    'Choose valid upload, image and note limits within the safe bounds.',
  'err.thisNoteContainsARetired':
    'This note contains a retired tag. Review tag changes before posting. Your editor is unchanged.',
  'err.tagSearchIsTooLong': 'Tag search is too long.',
  'err.previewAndConfirmAValid':
    'Preview and confirm a valid tag operation first.',
  'err.thisRetryDiffersFromThe':
    'This retry differs from the confirmed tag operation.',
  'err.affectedNotesOrTagsChanged':
    'Affected notes or tags changed after preview. Preview again; nothing was rewritten.',
  'err.aRewrittenNoteWouldExceed':
    'A rewritten note would exceed the configured text limit. Choose a shorter tag.',
  'err.anAffectedNoteCannotAccept':
    'An affected note cannot accept another revision.',
  'err.anAffectedNoteChangedPreview':
    'An affected note changed. Preview again.',
  'err.chooseAValidSourceTag': 'Choose a valid source tag and target spelling.',
  'err.theSourceTagNoLonger': 'The source tag no longer exists. Refresh tags.',
  'err.mergeRequiresADifferentExisting':
    'Merge requires a different existing tag.',
  'err.thatTagAlreadyExistsChoose':
    'That tag already exists. Choose Merge and preview the combined usage.',
  'err.chooseADifferentSpelling': 'Choose a different spelling.',
  'err.thisOperationExceedsTheSafe':
    'This operation exceeds the safe management limit (10,000 notes / 32 MiB). Operator assistance is required; no changes made.',
  'err.chooseAValidCalendarDate':
    'Choose a valid calendar date between 1969 and 9998.',
  'err.chooseAValidYearAnd': 'Choose a valid year and month.',
  'err.theNoteHasChangedKeep':
    'The note has changed. Keep your local edits and reload the server version.',
  'err.invalidNoteState': 'Invalid note state.',
  'err.thisNoteCannotMakeThat': 'This note cannot make that transition.',
  'err.searchCannotContainANul': 'Search cannot contain a NUL character.',
  'err.searchInputIsTooLong':
    'Search input is too long (1024 characters including escapes).',
  'err.putAPhraseInSeparate': 'Put a phrase in separate double quotes.',
  'err.closeTheDoubleQuoteTo':
    'Close the double quote to search an exact phrase.',
  'err.separateSearchTermsWithSpaces': 'Separate search terms with spaces.',
  'err.anExactPhraseCannotBe': 'An exact phrase cannot be empty.',
  'err.normalizedSearchIsLimitedTo':
    'Normalized search is limited to 256 characters.',
  'err.useAtMost20Search': 'Use at most 20 search terms.',
  'err.searchTagNeedsAName':
    'Write a tag name after tag:, for example tag:work.',
  'err.searchHasTooManyOperators': 'Use at most 40 AND, OR or NOT operators.',
  'err.searchIsNestedTooDeeply': 'Search groups and NOT are nested too deeply.',
  'err.searchOperatorNeedsOperand':
    'AND, OR and NOT need a search term on each side that applies.',
  'err.searchEmptyGroup': 'Parentheses cannot be empty.',
  'err.searchUnbalancedParentheses':
    'Close every ( with ) or put the text in double quotes.',
  'err.invalidTrashQuery': 'Invalid Trash query.',
  'err.chooseTrashAndAPage': 'Choose Trash and a page size from 1 to 100.',
  'err.invalidTagFilter': 'Invalid tag filter.',
  'err.invalidSelectedDayRange': 'Invalid selected-day range.',
  'err.chooseAMonthOrA': 'Choose a month or a day, not both.',
  'err.selectOnlyOneTag': 'Select only one tag.',
  'err.invalidTimelineQuery': 'Invalid timeline query.',
  'err.pageSizeMustBeBetween': 'Page size must be between 1 and 100.',
  'err.signInToContinue': 'Sign in to continue.',
  'err.unableToSignInCheck': 'Unable to sign in. Check your credentials.',
  'err.invalidSecurityRequest': 'Invalid security request.',
  'err.unexpectedBackupQuery': 'Unexpected backup query.',
  'err.downloadGrantsMustNotBe': 'Download grants must not be in URLs.',
  'err.chooseOneCalendarYear': 'Choose one calendar year.',
  'err.chooseAYearBetween1969': 'Choose a year between 1969 and 9998.',
  'err.chooseOneCalendarMonth': 'Choose one calendar month.',
  'err.useACreateNoteRequest': 'Use a create-note request.',
  'err.useAnUpdateRequestFor': 'Use an update request for this note.',
  'err.useALifecycleActionFor': 'Use a lifecycle action for this note.',
  'err.invalidTagSearch': 'Invalid tag search.',
  'err.invalidTagHistoryCheck': 'Invalid tag history check.',
  'shell.templates': 'Templates',
  'templates.title': 'Templates',
  'templates.search': 'Search templates',
  'templates.new': 'New template',
  'templates.none': 'No templates yet. Create one to start notes faster.',
  'templates.noMatch': 'No templates match your search.',
  'templates.selectAll': 'Select all templates',
  'templates.selectOne': 'Select template {name}',
  'templates.selectedCount': '{count} selected',
  'templates.deleteSelected': 'Delete selected templates',
  'templates.deleteTitle': 'Delete templates?',
  'templates.deleteOne':
    'Delete this template? Notes already created from it are not changed.',
  'templates.deleteMany':
    'Delete {count} templates? Notes already created from them are not changed.',
  'templates.deleteConfirm': 'Delete',
  'templates.deleteStopped':
    'Stopped after {done} of {total}. The remaining templates are still selected.',
  'templates.editTitle': 'Edit template',
  'templates.newTitle': 'New template',
  'templates.name': 'Name',
  'templates.body': 'Template text',
  'templates.save': 'Save template',
  'templates.saving': 'Saving…',
  'templates.discardQuestion': 'Discard your changes to this template?',
  'templates.keepEditing': 'Keep editing',
  'templates.reloadHint':
    'Close this window and reopen the template to see the latest version. Your text is still here to copy.',
  'templates.insert': 'Insert template',
  'templates.insertTitle': 'Template',
  'templates.pickerNone': 'No templates yet. Create one on the Templates page.',
  'templates.pickerNoMatch': 'No templates match your search.',
  'templates.tooLarge':
    'The template would exceed the Markdown size limit, so nothing was inserted.',
  'templates.loadFailed': 'Templates could not be loaded. Try again.',
  'templates.busy': 'Finish the current action first.',
  'err.templateChanged':
    'This template changed somewhere else. Close and reopen it to see the latest version.',
  'err.templateNotFound': 'This template no longer exists.',
  'err.templateRequestInvalid': 'The template request is not valid.',
  'err.templateNameInvalid':
    'Use a name of 1–60 characters without control characters.',
  'err.templateBodyRequired': 'Write some text for the template.',
  'err.templateAttachmentReference':
    'Templates cannot contain attached photos or files.',
  'err.templateBodyTooLarge':
    'This template is larger than the Markdown size limit.',
  'err.templateNameExists': 'A template with this name already exists.',
  'err.templateMutationMismatch':
    'This retry has different template content. Start again.',
  'err.templateLoadFailed': 'Templates could not be loaded. Try again.',
  'err.templateSaveFailed': 'The template could not be saved. Try again.',
} as const;
export type MessageKey = keyof typeof en;
export type Catalog = Record<MessageKey, string>;
