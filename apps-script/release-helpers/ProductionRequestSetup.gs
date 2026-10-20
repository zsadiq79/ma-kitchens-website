/* Temporary owner-run setup helper. Never logs or returns the signing secret.
 * Uses the reviewed LIVE binding and shared lock. Does not enable capture.
 * Remove this helper file after private setup; the deployed Version 47 is unchanged.
 */
function prepareProductionOrderRequestSigningSecret() {
  if (MK_RELEASE.environment !== 'PRODUCTION') throw new Error('Production setup only.');
  mkReleaseOwnerBook_(false);
  return mkLocked_(() => {
    const props = PropertiesService.getScriptProperties();
    if (!['ACTIVE', 'PAUSED'].includes(mkReleasePhase_())) throw new Error('Activate the owner workspace first.');
    if (props.getProperty('ORDER_AUTOMATION_CAPTURE_ENABLED') === 'true') throw new Error('Pause public capture before setup.');
    let secret = props.getProperty('ORDER_REQUEST_API_SECRET');
    if (secret && (secret.length < 32 || /[\r\n]/.test(secret))) throw new Error('Existing signing secret needs private review. It was not replaced.');
    const created = !secret;
    if (created) {
      secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      props.setProperty('ORDER_REQUEST_API_SECRET', secret);
    }
    if (!secret || secret.length < 32 || props.getProperty('ORDER_REQUEST_API_SECRET') !== secret) throw new Error('Signing secret was not verified as saved.');
    const result = { ok: true, environment: 'PRODUCTION', property: 'ORDER_REQUEST_API_SECRET', created: created,
      secretLength: secret.length, secretLogged: false, captureEnabled: false };
    console.log(JSON.stringify(result));
    return result;
  });
}
