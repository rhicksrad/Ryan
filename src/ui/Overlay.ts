import type { RouteName } from './Router';
import type { ProfileData, ProfileLink } from '../types';

type OverlayRoute = RouteName;

interface OverlayOptions {
  container: HTMLElement;
  profile: ProfileData;
  onClose: () => void;
  onResumeRequest: () => void;
}

interface OverlayController {
  element: HTMLElement;
  setRoute(route: OverlayRoute): void;
  close(): void;
}

function createList(title: string, items: ProfileLink[]): HTMLDivElement {
  const wrapper = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'overlay__section-title';
  heading.textContent = title;
  wrapper.appendChild(heading);
  const list = document.createElement('ul');
  list.className = 'overlay__list';
  for (const item of items) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'overlay__link';
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = item.title;
    if (item.description) {
      link.title = item.description;
    }
    li.appendChild(link);
    if (item.description) {
      const span = document.createElement('span');
      span.textContent = ` — ${item.description}`;
      li.appendChild(span);
    }
    list.appendChild(li);
  }
  wrapper.appendChild(list);
  return wrapper;
}

export function createOverlay(options: OverlayOptions): OverlayController {
  const { container, profile, onClose, onResumeRequest } = options;
  const overlay = document.createElement('aside');
  overlay.className = 'overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${profile.name} overlay`);
  overlay.dataset.open = 'false';

  const header = document.createElement('div');
  header.className = 'overlay__header';

  const title = document.createElement('h2');
  title.className = 'overlay__title';
  title.textContent = profile.headline;
  header.appendChild(title);

  const closeButton = document.createElement('button');
  closeButton.className = 'overlay__close';
  closeButton.type = 'button';
  closeButton.innerText = 'Close';
  closeButton.addEventListener('click', () => {
    controller.close();
    onClose();
  });
  header.appendChild(closeButton);

  const summary = document.createElement('p');
  summary.textContent = profile.summary;

  const content = document.createElement('div');
  content.className = 'overlay__content';
  content.appendChild(summary);

  const skillsHeading = document.createElement('h3');
  skillsHeading.className = 'overlay__section-title';
  skillsHeading.textContent = 'Skills';
  content.appendChild(skillsHeading);
  const skillsList = document.createElement('ul');
  skillsList.className = 'overlay__list';
  for (const skill of profile.skills) {
    const li = document.createElement('li');
    li.textContent = skill;
    skillsList.appendChild(li);
  }
  content.appendChild(skillsList);

  const principlesHeading = document.createElement('h3');
  principlesHeading.className = 'overlay__section-title';
  principlesHeading.textContent = 'Principles';
  content.appendChild(principlesHeading);
  const principlesList = document.createElement('ul');
  principlesList.className = 'overlay__list';
  for (const principle of profile.principles) {
    const li = document.createElement('li');
    li.textContent = principle;
    principlesList.appendChild(li);
  }
  content.appendChild(principlesList);

  content.appendChild(createList('Projects', profile.projects));
  content.appendChild(createList('Writing', profile.writing));
  content.appendChild(createList('Talks', profile.talks));

  const contactSection = document.createElement('div');
  const contactHeading = document.createElement('h3');
  contactHeading.className = 'overlay__section-title';
  contactHeading.textContent = 'Contact';
  contactSection.appendChild(contactHeading);
  const emailLink = document.createElement('a');
  emailLink.className = 'overlay__link';
  emailLink.href = `mailto:${profile.contact.email}`;
  emailLink.textContent = profile.contact.email;
  contactSection.appendChild(emailLink);
  const socialsList = document.createElement('ul');
  socialsList.className = 'overlay__list';
  for (const social of profile.contact.socials) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'overlay__link';
    link.href = social.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = social.title;
    if (social.description) {
      link.title = social.description;
    }
    li.appendChild(link);
    socialsList.appendChild(li);
  }
  contactSection.appendChild(socialsList);
  content.appendChild(contactSection);

  const footer = document.createElement('footer');
  const resumeButton = document.createElement('button');
  resumeButton.className = 'overlay__close';
  resumeButton.type = 'button';
  resumeButton.textContent = 'Open Resume';
  resumeButton.addEventListener('click', () => {
    onResumeRequest();
  });
  footer.appendChild(resumeButton);

  overlay.appendChild(header);
  overlay.appendChild(content);
  overlay.appendChild(footer);

  container.appendChild(overlay);

  let currentRoute: OverlayRoute = '#home';

  function focusFirstElement(): void {
    const focusable = overlay.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      controller.close();
      onClose();
    }
    if (event.key === 'Tab') {
      const focusable = overlay.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  overlay.addEventListener('keydown', handleKeyDown);

  const controller: OverlayController = {
    element: overlay,
    setRoute(route: OverlayRoute) {
      currentRoute = route;
      const shouldOpen = route !== '#home';
      overlay.dataset.open = shouldOpen ? 'true' : 'false';
      overlay.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
      if (shouldOpen) {
        requestAnimationFrame(() => focusFirstElement());
      }
    },
    close() {
      overlay.dataset.open = 'false';
      overlay.setAttribute('aria-hidden', 'true');
      currentRoute = '#home';
    }
  };

  controller.setRoute('#home');

  return controller;
}
