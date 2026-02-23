import { Pipe, PipeTransform } from '@angular/core';

/** Standalone function for use outside templates. */
export function formatName(value: string): string {
  return value.replace(/_/g, ' ');
}

@Pipe({ name: 'formatName', pure: true })
export class FormatNamePipe implements PipeTransform {
  transform(value: string): string {
    return formatName(value);
  }
}
