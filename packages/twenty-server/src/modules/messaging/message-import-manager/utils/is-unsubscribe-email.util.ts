const UNSUBSCRIBE_KEYWORD_PATTERN =
  /(?<![a-z])(unsubscribe|unsub|opt[.\-_]?out)(?![a-z])/;

export const isUnsubscribeEmail = (email: string): boolean => {
  const normalizedEmail = email.toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf('@');
  const localPart =
    atIndex === -1 ? normalizedEmail : normalizedEmail.slice(0, atIndex);
  const domain = atIndex === -1 ? '' : normalizedEmail.slice(atIndex + 1);
  // dedicated subdomains like unsubscribe2.customer.io count, company-name
  // domains like unsubscribe-tools.com do not
  const subdomainLabels = domain.split('.').slice(0, -2);

  return (
    UNSUBSCRIBE_KEYWORD_PATTERN.test(localPart) ||
    subdomainLabels.some((label) => UNSUBSCRIBE_KEYWORD_PATTERN.test(label))
  );
};
