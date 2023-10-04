export default async function (domain, user, session, patch, si, ii, send) {
  //  TODO: actually handle side effects for new session creation... if any...
  send({ si, ii }) // non-side-effect inducing patch
}
