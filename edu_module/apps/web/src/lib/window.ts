/**
 * Atama tarih penceresi kuralları. Saf fonksiyon: DB'ye dokunmaz.
 */

export type EnrollmentWindow = {
  startsAt: Date;
  dueAt: Date | null;
  passed: boolean;
};

export type WindowCheck = { open: true } | { open: false; reason: string };

/**
 * Eğitim penceresi açık mı? Kapalıysa neden kapalı olduğunu döner.
 *
 * Başlangıç tarihi gelmeden eğitime girilemez. Son tarih geçtiyse eğitim
 * kapanır; ancak zaten başarıyla tamamlamış kullanıcı içeriğe erişmeye
 * devam edebilir.
 */
export function checkWindow(
  enrollment: EnrollmentWindow,
  now: Date = new Date(),
): WindowCheck {
  if (enrollment.startsAt > now) {
    return {
      open: false,
      reason: `Bu eğitim ${enrollment.startsAt.toLocaleString("tr-TR")} tarihinde açılacak.`,
    };
  }
  if (enrollment.dueAt && enrollment.dueAt < now && !enrollment.passed) {
    return {
      open: false,
      reason: `Son tamamlama tarihi geçti (${enrollment.dueAt.toLocaleString("tr-TR")}).`,
    };
  }
  return { open: true };
}
