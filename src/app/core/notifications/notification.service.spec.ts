import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with empty toasts', () => {
    expect(service.toasts()).toEqual([]);
  });

  it('show adds a toast', () => {
    service.show('Test message');
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe('Test message');
    expect(service.toasts()[0].type).toBe('info');
  });

  it('show respects type and coords', () => {
    service.show('Combat!', { type: 'danger', q: 1, r: 2 });
    const toast = service.toasts()[0];
    expect(toast.type).toBe('danger');
    expect(toast.q).toBe(1);
    expect(toast.r).toBe(2);
  });

  it('dismiss removes a toast', () => {
    service.show('A');
    service.show('B');
    const id = service.toasts()[0].id;
    service.dismiss(id);
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe('B');
  });

  it('caps at 5 toasts', () => {
    for (let i = 0; i < 7; i++) {
      service.show(`Toast ${i}`);
    }
    expect(service.toasts().length).toBe(5);
    expect(service.toasts()[0].message).toBe('Toast 2');
  });

  it('auto-dismisses after 5 seconds', () => {
    service.show('Auto dismiss');
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(5000);
    expect(service.toasts().length).toBe(0);
  });

  it('auto-dismiss does not affect manually dismissed toasts', () => {
    service.show('Manual');
    const id = service.toasts()[0].id;
    service.dismiss(id);
    expect(service.toasts().length).toBe(0);

    // Advancing timers should not cause errors
    vi.advanceTimersByTime(5000);
    expect(service.toasts().length).toBe(0);
  });
});
