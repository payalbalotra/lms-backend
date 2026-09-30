import config from '../../config/index.ts';

export const getAuthEmailTemplate = (
  title: string,
  bodyText: string,
  otp: string,
): string => {
  const url = config.r2PublicBaseUrl + '/logo-icon.png';
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${title} — RoofBros</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    /* Dark mode: Apple Mail and Outlook invert colours unless told otherwise.
       Keep the maroon header maroon and the code readable. */
    @media (prefers-color-scheme: dark) {
      .rb-card  { background:#1C1611 !important; }
      .rb-ink   { color:#F5F0EA !important; }
      .rb-body  { color:#CFC5B8 !important; }
      .rb-muted { color:#A2988B !important; }
      .rb-panel { background:#251E17 !important; border-color:#3A3129 !important; }
      .rb-line  { border-color:#3A3129 !important; }
    }
    @media only screen and (max-width:600px) {
      .rb-pad { padding:28px 24px !important; }
      .rb-otp { font-size:30px !important; letter-spacing:6px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#F1EEEA;">

  <!-- Preheader: the grey preview line in the inbox. Without it, clients grab
       whatever text comes first, which is usually the wrong thing. -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1EEEA;">
    Your RoofBros verification code is ${otp} — it expires in 5 minutes.
    &#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1EEEA;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
               class="rb-card" style="width:100%;max-width:520px;background-color:#FFFFFF;border:1px solid #E2DCD4;">

          <!-- ── Header ────────────────────────────────────────────────────
               White tile behind the logo — the same treatment as the app's
               splash screen. A maroon logo on a maroon field disappears. -->
          <tr>
            <td align="center" style="background-color:#7D1017;padding:32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" style="width:44px;background-color:#FFFFFF;padding:6px;" align="center" valign="middle">
                    <img src="${url}" alt="RoofBros"
                         width="32" height="32"
                         style="display:block;width:32px;height:32px;border:0;outline:none;text-decoration:none;" />
                  </td>
                  <td style="padding-left:14px;" valign="middle">
                    <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:23px;font-weight:700;color:#FFFFFF;letter-spacing:-0.2px;line-height:44px;">RoofBros</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Body ─────────────────────────────────────────────────────── -->
          <tr>
            <td class="rb-pad" style="padding:40px;">

              <h1 class="rb-ink" style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#2D2012;line-height:1.15;letter-spacing:-0.3px;">${title}</h1>

              <p class="rb-body" style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#55483B;line-height:1.6;">
                ${bodyText}
              </p>

              <!-- Code. letter-spacing adds a gap after the LAST digit too, so
                   padding-left of the same amount keeps it optically centred. -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                <tr>
                  <td class="rb-panel" align="center" style="background-color:#F7F4F1;border:1px solid #E2DCD4;padding:26px 20px;">
                    <p class="rb-muted" style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;color:#807568;letter-spacing:1.2px;text-transform:uppercase;">Verification code</p>
                    <p class="rb-ink rb-otp" style="margin:0;padding-left:10px;font-family:'SF Mono',Consolas,'Courier New',monospace;font-size:34px;font-weight:700;color:#2D2012;letter-spacing:10px;line-height:1.1;">${otp}</p>
                  </td>
                </tr>
              </table>

              <!-- Expiry -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td class="rb-line" style="border-left:3px solid #7D1017;padding:2px 0 2px 14px;">
                    <p class="rb-muted" style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#807568;line-height:1.6;">
                      Expires in <strong class="rb-ink" style="color:#2D2012;font-weight:600;">5 minutes</strong>, and can only be used once.
                    </p>
                  </td>
                </tr>
              </table>

              <p class="rb-muted" style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#807568;line-height:1.6;">
                Didn't request this? You can safely ignore this email — no account will be created and nothing will change.
              </p>
            </td>
          </tr>

          <!-- ── Footer ───────────────────────────────────────────────────── -->
          <tr>
            <td class="rb-line" align="center" style="border-top:1px solid #E2DCD4;padding:20px 40px;">
              <p class="rb-muted" style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#807568;line-height:1.5;">
                &copy; ${new Date().getFullYear()} RoofBros &middot; Tile recycling &amp; roofing supplies
              </p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->

      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const getNotificationEmailTemplate = (
  title: string,
  bodyText: string,
): string => {
  const url = config.r2PublicBaseUrl + '/logo-icon.png';
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${title} — RoofBros</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @media (prefers-color-scheme: dark) {
      .rb-card  { background:#1C1611 !important; }
      .rb-ink   { color:#F5F0EA !important; }
      .rb-body  { color:#CFC5B8 !important; }
      .rb-muted { color:#A2988B !important; }
      .rb-line  { border-color:#3A3129 !important; }
    }
    @media only screen and (max-width:600px) {
      .rb-pad { padding:28px 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#F1EEEA;">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1EEEA;">
    ${title}
    &#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1EEEA;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
               class="rb-card" style="width:100%;max-width:520px;background-color:#FFFFFF;border:1px solid #E2DCD4;">

          <tr>
            <td align="center" style="background-color:#7D1017;padding:32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" style="width:44px;background-color:#FFFFFF;padding:6px;" align="center" valign="middle">
                    <img src="${url}" alt="RoofBros"
                         width="32" height="32"
                         style="display:block;width:32px;height:32px;border:0;outline:none;text-decoration:none;" />
                  </td>
                  <td style="padding-left:14px;" valign="middle">
                    <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:23px;font-weight:700;color:#FFFFFF;letter-spacing:-0.2px;line-height:44px;">RoofBros</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="rb-pad" style="padding:40px;">
              <h1 class="rb-ink" style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#2D2012;line-height:1.15;letter-spacing:-0.3px;">${title}</h1>
              <p class="rb-body" style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#55483B;line-height:1.6;">
                ${bodyText}
              </p>
            </td>
          </tr>

          <tr>
            <td class="rb-line" align="center" style="border-top:1px solid #E2DCD4;padding:20px 40px;">
              <p class="rb-muted" style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#807568;line-height:1.5;">
                &copy; ${new Date().getFullYear()} RoofBros &middot; Tile recycling &amp; roofing supplies
              </p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
};
