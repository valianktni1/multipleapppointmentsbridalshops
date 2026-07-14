// Common SMTP settings for popular email providers.
// Source: "Common SMTP Email Settings" reference guide.
// Each provider may offer two secure options: SSL/TLS (usually port 465)
// and STARTTLS (usually port 587).

export const SMTP_PROVIDERS = [
  {
    provider: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    options: [
      { port: 587, encryption: "STARTTLS" },
      { port: 465, encryption: "SSL/TLS" },
    ],
    appPassword: true,
    notes: "Requires a Google App Password when two-step verification is enabled.",
  },
  {
    provider: "Outlook.com / Hotmail / Live",
    host: "smtp-mail.outlook.com",
    options: [{ port: 587, encryption: "STARTTLS" }],
    appPassword: false,
    notes: "Microsoft Modern Authentication (OAuth2) is preferred; some accounts allow an App Password.",
  },
  {
    provider: "Microsoft 365 Business",
    host: "smtp.office365.com",
    options: [{ port: 587, encryption: "STARTTLS" }],
    appPassword: false,
    notes: "Authenticated SMTP may need to be enabled by your Microsoft 365 administrator.",
  },
  {
    provider: "Yahoo Mail",
    host: "smtp.mail.yahoo.com",
    options: [
      { port: 465, encryption: "SSL/TLS" },
      { port: 587, encryption: "STARTTLS" },
    ],
    appPassword: true,
    notes: "Requires a Yahoo App Password.",
  },
  {
    provider: "Apple iCloud Mail",
    host: "smtp.mail.me.com",
    options: [{ port: 587, encryption: "STARTTLS" }],
    appPassword: true,
    notes: "Requires an Apple app-specific password.",
  },
  {
    provider: "AOL Mail",
    host: "smtp.aol.com",
    options: [{ port: 465, encryption: "SSL/TLS" }],
    appPassword: true,
    notes: "An AOL App Password may be required.",
  },
  {
    provider: "BT Email",
    host: "mail.btinternet.com",
    options: [
      { port: 465, encryption: "SSL/TLS" },
      { port: 587, encryption: "STARTTLS" },
    ],
    appPassword: false,
    notes: "Use your full BT email address and BT email password.",
  },
  {
    provider: "Sky Yahoo Mail",
    host: "smtp.tools.sky.com",
    options: [
      { port: 465, encryption: "SSL/TLS" },
      { port: 587, encryption: "STARTTLS" },
    ],
    appPassword: true,
    notes: "Requires a Sky Yahoo App Password.",
  },
  {
    provider: "Virgin Media Mail",
    host: "smtp.virginmedia.com",
    options: [{ port: 465, encryption: "SSL/TLS" }],
    appPassword: true,
    notes: "Requires your Virgin Media Mail App Password.",
  },
  {
    provider: "TalkTalk Mail",
    host: "smtp.talktalk.net",
    options: [{ port: 587, encryption: "STARTTLS" }],
    appPassword: false,
    notes: "Use your full TalkTalk email address and email password.",
  },
  {
    provider: "Plusnet Mail",
    host: "relay.plus.net",
    options: [
      { port: 587, encryption: "STARTTLS" },
      { port: 465, encryption: "SSL/TLS" },
    ],
    appPassword: false,
    notes: "Use your Plusnet mailbox username and password.",
  },
  {
    provider: "Zoho Mail",
    host: "smtp.zoho.eu / smtp.zoho.com",
    options: [
      { port: 587, encryption: "STARTTLS" },
      { port: 465, encryption: "SSL/TLS" },
    ],
    appPassword: true,
    notes: "Use the server shown in your Zoho account. An App Password may be required with 2FA.",
  },
  {
    provider: "Fastmail",
    host: "smtp.fastmail.com",
    options: [
      { port: 465, encryption: "SSL/TLS" },
      { port: 587, encryption: "STARTTLS" },
    ],
    appPassword: true,
    notes: "Requires a Fastmail App Password — your normal password will not work.",
  },
  {
    provider: "Proton Mail",
    host: "smtp.protonmail.ch",
    options: [{ port: 587, encryption: "STARTTLS" }],
    appPassword: false,
    notes: "Only on eligible paid plans using a custom-domain address and a generated SMTP token.",
  },
  {
    provider: "Custom domain / hosting email",
    host: "Provided by your email host",
    options: [
      { port: 465, encryption: "SSL/TLS" },
      { port: 587, encryption: "STARTTLS" },
    ],
    appPassword: false,
    notes: "Check with your website or email hosting company for exact settings.",
  },
];

export const APP_PASSWORD_EXPLAINER = {
  title: "What is an App Password?",
  body:
    "Many providers no longer allow apps to sign in with your normal account password when two-step verification (2FA) is turned on. Instead, you generate a one-off “App Password” — a long code created inside your email account's security settings. Paste that code into the Password field here (spaces are fine). It only works for this app and can be revoked at any time without changing your main password.",
  providersNeedingIt:
    "Commonly required by Gmail, Yahoo, iCloud, AOL, Sky, Virgin Media, Fastmail and Zoho (with 2FA).",
};

export const TROUBLESHOOTING_TIPS = [
  "Double-check the SMTP host is spelled exactly as shown (no extra spaces).",
  "Match the port with the encryption: 465 with SSL/TLS, 587 with STARTTLS.",
  "Use your full email address as the username — it must match the “from” address.",
  "If your provider uses 2FA, generate and paste an App Password instead of your login password.",
  "For Microsoft 365, ask your admin to enable “Authenticated SMTP” for your mailbox.",
  "Some providers require you to enable access for third-party apps in account settings.",
  "After saving, always press “Send Test Email” to confirm everything works.",
];
