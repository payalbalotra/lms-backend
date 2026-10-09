import config from '../../config/env.ts';

const ORANGE_THEME = '#C24A30'; // Dark Orange / Rust theme
export const BRAND_NAME = 'Almentria Mexicana';
const RESTAURANT_NAME = BRAND_NAME;
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

// Uploaded by scripts/upload-email-assets.ts. A hosted PNG because email
// clients do not render SVG or data: URI images.
const ZIGZAG_PATH = '/assets/email/header-zigzag.png';

/** Labels shown under the location name, as in the app's sidebar. */
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
};

export interface EmailHeaderInfo {
  /** First line, e.g. the employee's location ("Mexicana Main"). */
  title: string;
  /** Employee role key (super_admin, manager, employee). Omitted: no second line. */
  role?: string | undefined;
}

/**
 * The app's sidebar header: logo tile, title over role, on the rust colour,
 * with a stepped zigzag bottom edge. Built from tables and inline styles so
 * it renders the same in Gmail, Outlook and Apple Mail.
 */
function brandHeader({ title, role }: EmailHeaderInfo): string {
  const logoUrl = config.r2PublicBaseUrl + '/logo/brand-mark.png';
  const zigzagUrl = config.r2PublicBaseUrl + ZIGZAG_PATH;
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : '';
  const roleLine = roleLabel
    ? `\n                    <p style="margin:0;font-family:${FONT};font-size:15px;color:#FBE4DC;line-height:20px;">${escapeHtml(roleLabel)}</p>`
    : '';
  return `
          <tr>
            <td align="left" bgcolor="${ORANGE_THEME}" style="background-color:${ORANGE_THEME};padding:18px 24px 14px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" valign="middle" style="width:44px;">
                    <img src="${logoUrl}" alt="${RESTAURANT_NAME}" width="44" height="44" style="display:block;width:44px;height:44px;border:1px solid rgba(255,255,255,0.35);border-radius:10px;outline:none;text-decoration:none;" />
                  </td>
                  <td valign="middle" style="padding-left:14px;">
                    <p style="margin:0;font-family:${FONT};font-size:17px;font-weight:600;color:#FFFFFF;line-height:22px;">${escapeHtml(title)}</p>${roleLine}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0;font-size:0;line-height:0;background-color:#FFFFFF;">
              <img src="${zigzagUrl}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;outline:none;" />
            </td>
          </tr>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const getAuthEmailAndResetPasswordTemplate = (
  title: string,
  bodyText: string,
  otp: string,
  header: EmailHeaderInfo,
): string => {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title} — ${RESTAURANT_NAME}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;width:100%;background-color:#F9F9F9;">

  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F9F9F9;">
    Your ${RESTAURANT_NAME} verification code is ${otp} — it expires in 10 minutes.
    &#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F9F9F9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;max-width:520px;background-color:#FFFFFF;border:1px solid #EAEAEA;border-radius:8px;overflow:hidden;">
          
          <!-- Header -->${brandHeader(header)}

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#1A1A1A;line-height:1.2;letter-spacing:-0.3px;">${title}</h1>
              <p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:#4A4A4A;line-height:1.6;">
                ${bodyText}
              </p>

              <!-- Verification Code Panel -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" style="background-color:#FFF7ED;border:1px solid #FFEDD5;padding:30px 20px;border-radius:6px;">
                    <p style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#C2410C;letter-spacing:1.2px;text-transform:uppercase;">Verification code</p>
                    <p style="margin:0;padding-left:12px;font-family:'SF Mono',Consolas,'Courier New',monospace;font-size:36px;font-weight:700;color:#9A3412;letter-spacing:12px;line-height:1.1;">${otp}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#737373;line-height:1.6;">
                Didn't request this? You can safely ignore this email - no account will be created and nothing will change.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color:#FAFAFA;border-top:1px solid #EAEAEA;padding:24px 40px;">
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;line-height:1.5;">
                &copy; ${new Date().getFullYear()} ${RESTAURANT_NAME} &middot; All rights reserved.
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
  header: EmailHeaderInfo,
): string => {
  const title = `Welcome to ${RESTAURANT_NAME}`;
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;width:100%;background-color:#F9F9F9;">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F9F9F9;">
    ${title}
    &#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F9F9F9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;max-width:520px;background-color:#FFFFFF;border:1px solid #EAEAEA;border-radius:8px;overflow:hidden;">
          
          <!-- Header -->${brandHeader(header)}

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#1A1A1A;line-height:1.2;letter-spacing:-0.3px;">${title}</h1>
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:#4A4A4A;line-height:1.6;">
                Hi ${employeeName?.trim() || 'there'},<br><br>
                You've been invited to join the <strong>${RESTAURANT_NAME} LMS</strong> platform. Please click the button below to set up your account password and log in.
              </p>
              
              <!-- Inline styled button ensures it works in all email clients -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px;margin-bottom:30px;">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" style="display:inline-block;padding:14px 28px;background-color:${ORANGE_THEME};color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:16px;border-radius:6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Set Up Account</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#737373;line-height:1.6;">
                If the button above does not work, copy and paste the following link into your browser:<br>
                <a href="${inviteUrl}" style="color:${ORANGE_THEME};word-break:break-all;">${inviteUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color:#FAFAFA;border-top:1px solid #EAEAEA;padding:24px 40px;">
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;line-height:1.5;">
                &copy; ${new Date().getFullYear()} ${RESTAURANT_NAME} LMS &middot; All rights reserved.
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
