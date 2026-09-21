import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { ConfigCrudComponent, CrudLookup, CrudSection } from '../shared/config-crud';

const EMPLOYEE_SECTIONS: CrudSection[] = [
  { key: 'employees', label: 'Employees', singular: 'employee', path: 'staff/employees', paged: true,
    cols: [{ key: 'employeeCode', label: 'Code' }, { key: 'fullName', label: 'Name' }, { key: 'department', label: 'Department' }, { key: 'designation', label: 'Designation' }, { key: 'shift', label: 'Shift' }, { key: 'phone', label: 'Phone' }],
    fields: [
      { key: 'employeeCode', label: 'Employee code', type: 'text', required: true }, { key: 'fullName', label: 'Full name', type: 'text', required: true },
      { key: 'phone', label: 'Phone', type: 'text' }, { key: 'email', label: 'Email', type: 'email' },
      { key: 'departmentId', label: 'Department', type: 'select', options: 'departments', optional: true },
      { key: 'designationId', label: 'Designation', type: 'select', options: 'designations', optional: true },
      { key: 'shiftId', label: 'Default shift', type: 'select', options: 'shifts', optional: true },
      { key: 'userId', label: 'Linked login user', type: 'select', options: 'users', optional: true, hint: 'Optional: connects this employee to a sign-in account.' },
      { key: 'hireDate', label: 'Hire date', type: 'date' },
      { key: 'monthlySalary', label: 'Monthly salary', type: 'number', step: '0.01', nullIfZero: true },
      { key: 'isActive', label: 'Active', type: 'checkbox' }] },
];

const LOOKUPS: Record<string, CrudLookup> = {
  departments: { path: 'staff/departments', label: r => r['name'] },
  designations: { path: 'staff/designations', label: r => r['name'] },
  shifts: { path: 'staff/shifts', label: r => `${r['name']} (${r['startTime']}–${r['endTime']})` },
  users: { path: 'users', paged: true, label: r => `${r['fullName']} (${r['email']})` },
};

@Component({
  selector: 'app-employees',
  imports: [ConfigCrudComponent],
  template: `<app-config-crud title="Employees" subtitle="Everyone who works here" [sections]="sections" [lookups]="lookups" [canManage]="canManage()" />`,
})
export class EmployeesComponent {
  private readonly auth = inject(AuthService);
  protected readonly sections = EMPLOYEE_SECTIONS;
  protected readonly lookups = LOOKUPS;
  protected readonly canManage = computed(() => this.auth.hasPermission('Staff.Manage'));
}

const SETUP_SECTIONS: CrudSection[] = [
  { key: 'departments', label: 'Departments', singular: 'department', path: 'staff/departments', cols: [{ key: 'name', label: 'Department' }],
    fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
  { key: 'designations', label: 'Designations', singular: 'designation', path: 'staff/designations', cols: [{ key: 'name', label: 'Designation' }],
    fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'isActive', label: 'Active', type: 'checkbox' }] },
  { key: 'shifts', label: 'Shifts', singular: 'shift', path: 'staff/shifts', cols: [{ key: 'name', label: 'Shift' }, { key: 'startTime', label: 'Starts' }, { key: 'endTime', label: 'Ends' }],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'startTime', label: 'Start time', type: 'text', required: true, hint: '24-hour HH:mm, e.g. 08:00' },
      { key: 'endTime', label: 'End time', type: 'text', required: true, hint: 'A shift ending earlier than it starts runs past midnight.' },
      { key: 'isActive', label: 'Active', type: 'checkbox' }] },
];

@Component({
  selector: 'app-staff-setup',
  imports: [ConfigCrudComponent],
  template: `<app-config-crud title="Staff setup" subtitle="Departments, designations and working shifts" [sections]="sections" [canManage]="canManage()" />`,
})
export class StaffSetupComponent {
  private readonly auth = inject(AuthService);
  protected readonly sections = SETUP_SECTIONS;
  protected readonly canManage = computed(() => this.auth.hasPermission('Staff.Manage'));
}
