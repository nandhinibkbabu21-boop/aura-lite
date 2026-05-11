import React, { useState } from 'react'
import { Plus, Pencil, Trash2, Trophy } from 'lucide-react'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { addEmployee, updateEmployee, deleteEmployee, createUser } from '../../../services/db.js'
import { uid, fmt } from '../../../utils/formatters.js'
import { Btn, Badge, Card, Empty, Modal, Input, Select } from '../../ui/index.jsx'

const PERIODS = [
  { id: 'all',   label: 'All Time' },
  { id: 'month', label: 'This Month' },
  { id: 'week',  label: 'This Week' },
  { id: 'today', label: 'Today' },
]

export default function EmployeesTab({ employees, orders, shopId }) {
  const [modal, setModal]   = useState(false)
  const [editing, setEditing] = useState(null)
  const [period, setPeriod] = useState('all')

  const now = Date.now()
  const msMap = { today: 86400000, week: 604800000, month: 2592000000 }

  const filteredOrders = period === 'all' ? orders
    : orders.filter(o => now - (o.createdAt?.toDate?.() || new Date(o.date||0)).getTime() <= msMap[period])

  const empStats = {}
  filteredOrders.forEach(o => {
    if (!o.employeeId) return
    if (!empStats[o.employeeId]) empStats[o.employeeId] = { handled: 0, completed: 0, customers: new Set() }
    empStats[o.employeeId].handled++
    if (o.status === 'completed') empStats[o.employeeId].completed++
    if (o.customerId) empStats[o.employeeId].customers.add(o.customerId)
  })

  const sorted = [...employees].sort((a, b) => (empStats[b.id]?.handled || 0) - (empStats[a.id]?.handled || 0))
  const topId  = sorted[0]?.id

  const handleDelete = async (emp) => {
    if (!confirm(`Remove ${emp.name}?`)) return
    await deleteEmployee(shopId, emp.id)
    toast.success('Employee removed')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-xl font-bold">Employees ({employees.length})</h2>
        <Btn variant="gold" size="sm" onClick={() => { setEditing(null); setModal(true) }}>
          <Plus className="w-3.5 h-3.5" /> Add Employee
        </Btn>
      </div>

      {/* Period filter */}
      <div className="flex gap-2 mb-4">
        <span className="text-xs text-gray-500 self-center font-semibold">Stats:</span>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${period===p.id ? 'bg-gold-500 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {employees.length === 0 ? (
        <Empty title="No employees" subtitle="Add your first team member"
          action={<Btn variant="gold" onClick={() => setModal(true)}>+ Add Employee</Btn>} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
              <tr>
                <th className="text-left py-3 px-4">Employee</th>
                <th className="text-left py-3 px-4">Phone</th>
                <th className="text-left py-3 px-4">Customers</th>
                <th className="text-left py-3 px-4">Orders Handled</th>
                <th className="text-left py-3 px-4">Completed</th>
                <th className="text-left py-3 px-4">Salary</th>
                <th className="text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => {
                const stats = empStats[e.id] || { handled: 0, completed: 0, customers: new Set() }
                const isTop = e.id === topId && stats.handled > 0
                const pct   = Math.min(100, stats.handled * 5)
                return (
                  <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gold-100 flex items-center justify-center text-sm">
                          {e.gender === 'Female' ? '👩' : '👨'}
                        </div>
                        <div>
                          <p className="font-semibold flex items-center gap-1">
                            {e.name} {isTop && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
                          </p>
                          <p className="text-xs text-gray-400">@{e.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-500">{e.phone || '—'}</td>
                    <td className="py-3 px-4 font-bold text-blue-600">{stats.customers.size}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gold-600">{stats.handled}</span>
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gold-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4"><Badge color="green">{stats.completed} ✓</Badge></td>
                    <td className="py-3 px-4 font-semibold text-gray-700">{e.salary ? fmt(e.salary)+'/mo' : '—'}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <Btn size="sm" variant="outline" onClick={() => { setEditing(e); setModal(true) }}><Pencil className="w-3 h-3" /></Btn>
                        <Btn size="sm" variant="ghost" onClick={() => handleDelete(e)}><Trash2 className="w-3 h-3 text-red-400" /></Btn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <EmployeeModal shopId={shopId} employee={editing}
          onClose={() => { setModal(false); setEditing(null) }} />
      )}
    </div>
  )
}

function EmployeeModal({ shopId, employee: emp, onClose }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      name:     emp?.name || '',
      username: emp?.username || '',
      phone:    emp?.phone || '',
      password: emp?.password || '',
      gender:   emp?.gender || 'Male',
      salary:   emp?.salary || '',
    }
  })
  const [loading, setLoading] = useState(false)

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      if (emp) {
        await updateEmployee(shopId, emp.id, data)
      } else {
        const id = await addEmployee(shopId, { ...data, role: 'employee' })
        await createUser(data.username, { role: 'employee', shopId, name: data.name, id, password: data.password })
      }
      toast.success(emp ? 'Updated!' : 'Employee added!')
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open title={emp ? 'Edit Employee' : 'Add Employee'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-3 pb-6">
        <Input label="Full Name" required error={errors.name?.message}
          {...register('name', { required: 'Name required' })} />
        <Input label="Username" required error={errors.username?.message}
          {...register('username', { required: 'Username required' })} />
        <Input label="Phone" type="tel" {...register('phone')} />
        <Input label="Password" type="password" required error={errors.password?.message}
          {...register('password', { required: !emp && 'Password required' })} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Gender" {...register('gender')}>
            <option>Male</option>
            <option>Female</option>
          </Select>
          <Input label="Salary (₹/mo)" type="number" {...register('salary')} />
        </div>
        <div className="flex gap-3 pt-2">
          <Btn type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="gold" className="flex-1" loading={loading}>
            {emp ? 'Save' : 'Add Employee'}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}
