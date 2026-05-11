import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function generateBillPDF(order, shop, customer) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const W = doc.internal.pageSize.getWidth()

  // Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor('#C9A84C')
  doc.text(shop?.name || 'Zara Aura', W / 2, 18, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor('#666')
  if (shop?.address) doc.text(shop.address, W / 2, 24, { align: 'center' })
  if (shop?.phone)   doc.text(`📞 ${shop.phone}`, W / 2, 29, { align: 'center' })
  if (shop?.gst)     doc.text(`GST: ${shop.gst}`, W / 2, 33, { align: 'center' })

  // Divider
  doc.setDrawColor('#C9A84C')
  doc.setLineWidth(0.5)
  doc.line(10, 36, W - 10, 36)

  // Bill meta
  doc.setFontSize(8)
  doc.setTextColor('#333')
  doc.text(`Bill #${(order.id || '').slice(-8).toUpperCase()}`, 10, 42)
  doc.text(new Date(order.date?.toDate?.() || order.date || Date.now())
    .toLocaleString('en-IN'), W - 10, 42, { align: 'right' })

  doc.text(`Customer: ${customer?.name || order.customerName || 'Guest'}`, 10, 48)
  doc.text(`Payment: ${order.paymentMode || '—'}`, W - 10, 48, { align: 'right' })
  if (order.employeeName) doc.text(`Served by: ${order.employeeName}`, 10, 53)

  // Items table
  const rows = (order.items || []).map(i => [
    i.name + (i.size ? ` (${i.size})` : ''),
    i.qty,
    `₹${Number(i.price).toLocaleString('en-IN')}`,
    `₹${Number(i.price * i.qty).toLocaleString('en-IN')}`
  ])

  autoTable(doc, {
    startY: 57,
    head: [['Item', 'Qty', 'Price', 'Total']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [201, 168, 76], textColor: 255 },
    margin: { left: 10, right: 10 },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 12 }, 2: { cellWidth: 22 }, 3: { cellWidth: 22 } }
  })

  const finalY = doc.lastAutoTable.finalY + 4

  // Totals
  const subtotal = (order.items || []).reduce((s, i) => s + i.price * i.qty, 0)
  const discount = order.discount || 0
  const total = order.total || subtotal - discount

  if (discount > 0) {
    doc.text(`Subtotal: ₹${subtotal.toLocaleString('en-IN')}`, W - 10, finalY, { align: 'right' })
    doc.setTextColor('#e53935')
    doc.text(`Discount: -₹${discount.toLocaleString('en-IN')}`, W - 10, finalY + 5, { align: 'right' })
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor('#C9A84C')
  doc.text(`TOTAL: ₹${total.toLocaleString('en-IN')}`, W - 10, finalY + (discount > 0 ? 12 : 5), { align: 'right' })

  // Footer
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor('#aaa')
  doc.text('Thank you for shopping with us! 🛍', W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })

  return doc
}

export function printBill(order, shop, customer) {
  const doc = generateBillPDF(order, shop, customer)
  doc.autoPrint()
  window.open(doc.output('bloburl'), '_blank')
}

export function downloadBill(order, shop, customer) {
  const doc = generateBillPDF(order, shop, customer)
  doc.save(`Bill-${(order.id || '').slice(-8).toUpperCase()}.pdf`)
}
