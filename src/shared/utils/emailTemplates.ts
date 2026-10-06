import config from '../../config/index.ts';

export const getAuthEmailAndResetPasswordTemplate = (
  title: string,
  bodyText: string,
  otp: string,
): string => {
  const url = config.r2PublicBaseUrl + '/logo/brand-mark.png';
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${title} — Almentria Mexicana</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    /* Removed dark mode to enforce white background everywhere */
    @media only screen and (max-width:600px) {
      .rb-pad { padding:28px 24px !important; }
      .rb-otp { font-size:30px !important; letter-spacing:6px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#FFFFFF;">

  <!-- Preheader: the grey preview line in the inbox. Without it, clients grab
       whatever text comes first, which is usually the wrong thing. -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#FFFFFF;">
    Your Almentria Mexicana verification code is ${otp} — it expires in 5 minutes.
    &#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
               class="rb-card" style="width:100%;max-width:520px;background-color:#FFFFFF;border:1px solid #E2DCD4;">

          <!-- ── Header ────────────────────────────────────────────────────
               White tile behind the logo — the same treatment as the app's
               splash screen. A maroon logo on a maroon field disappears. -->
          <tr>
            <td align="center" style="background-color:#C24A30;padding:32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" style="width:44px;background-color:#FFFFFF;padding:6px;" align="center" valign="middle">
                    <img src="${url}" alt="Almentria Mexicana"
                         width="32" height="32"
                         style="display:block;width:32px;height:32px;border:0;outline:none;text-decoration:none;" />
                  </td>
                  <td style="padding-left:14px;" valign="middle">
                    <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:23px;font-weight:700;color:#FFFFFF;letter-spacing:-0.2px;line-height:44px;">Almentria Mexicana</span>
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
                  <td class="rb-line" style="border-left:3px solid #C24A30;padding:2px 0 2px 14px;">
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
                &copy; ${new Date().getFullYear()} Almentria Mexicana &middot; All rights reserved.
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

export const getInviteEmailTemplate = (
  employeeName: string,
  inviteUrl: string,
): string => {
  const url = config.r2PublicBaseUrl + '/logo/brand-mark.png';
  const title = 'Welcome to Almentria Mexicana LMS';
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${title}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    /* Removed dark mode to enforce white background everywhere */
    @media only screen and (max-width:600px) {
      .rb-pad { padding:28px 24px !important; }
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background-color: #C24A30;
      color: #FFFFFF !important;
      text-decoration: none;
      font-weight: bold;
      border-radius: 6px;
      margin-top: 20px;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#FFFFFF;">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#FFFFFF;">
    ${title}
    &#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
               class="rb-card" style="width:100%;max-width:520px;background-color:#FFFFFF;border:1px solid #E2DCD4;">

          <tr>
            <td align="center" style="background-color:#C24A30;padding:32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" style="width:44px;background-color:#FFFFFF;padding:6px;border-radius:4px;" align="center" valign="middle">
                    <img src="${url}" alt="Almentria Mexicana"
                         width="32" height="32"
                         style="display:block;width:32px;height:32px;border:0;outline:none;text-decoration:none;" />
                  </td>
                  <td style="padding-left:14px;" valign="middle">
                    <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:23px;font-weight:700;color:#FFFFFF;letter-spacing:-0.2px;line-height:44px;">Almentria Mexicana LMS</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="rb-pad" style="padding:40px;">
              <h1 class="rb-ink" style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#2D2012;line-height:1.15;letter-spacing:-0.3px;">${title}</h1>
              <p class="rb-body" style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#55483B;line-height:1.6;">
                Hi ${employeeName},<br><br>
                You've been invited to join the Almentria Mexicana LMS platform. Please click the button below to set up your account password and log in.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" class="btn">Set Up Account</a>
                  </td>
                </tr>
              </table>
              <p class="rb-body" style="margin-top:20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#807568;line-height:1.6;">
                If the button above does not work, copy and paste the following link into your browser:<br>
                <a href="${inviteUrl}" style="color:#C24A30;word-break:break-all;">${inviteUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td class="rb-line" align="center" style="border-top:1px solid #E2DCD4;padding:20px 40px;">
              <p class="rb-muted" style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#807568;line-height:1.5;">
                &copy; ${new Date().getFullYear()} Almentria Mexicana LMS &middot; All rights reserved.
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

export const getResetPasswordEmailTemplate = (
  employeeName: string,
  resetUrl: string,
): string => {
  const url = config.r2PublicBaseUrl + '/logo/brand-mark.png';
  const title = 'Reset Your Password';
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${title}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    /* Removed dark mode to enforce white background everywhere */
    @media only screen and (max-width:600px) {
      .rb-pad { padding:28px 24px !important; }
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background-color: #C24A30;
      color: #FFFFFF !important;
      text-decoration: none;
      font-weight: bold;
      border-radius: 6px;
      margin-top: 20px;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#FFFFFF;">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#FFFFFF;">
    Click the link to reset your Almentria Mexicana LMS password.
    &#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
               class="rb-card" style="width:100%;max-width:520px;background-color:#FFFFFF;border:1px solid #E2DCD4;">

          <tr>
            <td align="center" style="background-color:#C24A30;padding:32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" style="width:44px;background-color:#FFFFFF;padding:6px;border-radius:4px;" align="center" valign="middle">
                    <img src="${url}" alt="Almentria Mexicana"
                         width="32" height="32"
                         style="display:block;width:32px;height:32px;border:0;outline:none;text-decoration:none;" />
                  </td>
                  <td style="padding-left:14px;" valign="middle">
                    <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:23px;font-weight:700;color:#FFFFFF;letter-spacing:-0.2px;line-height:44px;">Almentria Mexicana LMS</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="rb-pad" style="padding:40px;">
              <h1 class="rb-ink" style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#2D2012;line-height:1.15;letter-spacing:-0.3px;">${title}</h1>
              <p class="rb-body" style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#55483B;line-height:1.6;">
                Hi ${employeeName},<br><br>
                We received a request to reset the password for your Almentria Mexicana LMS account. Please click the button below to choose a new password.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" class="btn">Reset Password</a>
                  </td>
                </tr>
              </table>
              <p class="rb-body" style="margin-top:20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#807568;line-height:1.6;">
                If the button above does not work, copy and paste the following link into your browser:<br>
                <a href="${resetUrl}" style="color:#C24A30;word-break:break-all;">${resetUrl}</a>
                <br><br>
                If you did not request a password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <tr>
            <td class="rb-line" align="center" style="border-top:1px solid #E2DCD4;padding:20px 40px;">
              <p class="rb-muted" style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#807568;line-height:1.5;">
                &copy; ${new Date().getFullYear()} Almentria Mexicana LMS &middot; All rights reserved.
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
