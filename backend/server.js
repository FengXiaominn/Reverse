const http = require('http')
const fs = require('fs')
const { URL } = require('url')

const PORT = 3000

const activities = []
const hostNotifications = []
const receivedInvites = []
const hostViewInvites = []

function json(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  })
  res.end(body)
}

function nowText() {
  const d = new Date()
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  const h = `${d.getHours()}`.padStart(2, '0')
  const mm = `${d.getMinutes()}`.padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${mm}`
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => {
      data += chunk
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function createActivity(body) {
  const activityId = `act_${Date.now()}`
  const activity = {
    id: activityId,
    organizer: body.organizer || '我',
    court: body.court || '',
    date: body.date || '',
    time: body.time || '',
    people: body.people || '',
    hasDinner: !!body.hasDinner,
    dinnerTaste: body.dinnerTaste || '',
    dinnerBudget: body.dinnerBudget || '',
    note: body.note || '',
    participants: [],
    createdAt: nowText()
  }
  activities.unshift(activity)
  return activityId
}

function getActivityById(activityId) {
  return activities.find(a => a.id === activityId) || null
}

function joinActivity(activityId, participantName) {
  const activity = getActivityById(activityId)
  if (!activity) return { ok: false, reason: 'activity_not_found' }

  const exists = activity.participants.find(p => p.name === participantName)
  if (!exists) {
    activity.participants.push({ name: participantName, joinAt: nowText() })

    hostNotifications.unshift({
      id: `notify_${Date.now()}`,
      title: `${participantName} 报名了你的约球`,
      content: `${activity.date} ${activity.time} · ${activity.court}`,
      time: nowText()
    })

    const inviteId = `invite_${activityId}_${participantName}`
    receivedInvites.unshift({
      id: inviteId,
      from: activity.organizer,
      court: activity.court,
      date: activity.date,
      time: activity.time,
      people: activity.people,
      hasDinner: activity.hasDinner,
      status: 'pending',
      replyNote: '',
      participantName,
      activityId
    })
  }

  return { ok: true }
}

function seedData() {
  if (activities.length > 0) return
  const id = createActivity({
    organizer: 'Kevin',
    court: '鹏迈',
    date: '2026-03-25',
    time: '19:30',
    people: '4',
    hasDinner: true,
    note: '欢迎一起练球'
  })
  joinActivity(id, 'Mia')
}

seedData()

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {})

    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/api/invites/received') {
      return json(res, 200, receivedInvites)
    }

    if (req.method === 'GET' && pathname === '/api/invites/host-view') {
      const list = []
      for (const item of receivedInvites) {
        list.push({
          id: item.id,
          from: item.from,
          court: item.court,
          date: item.date,
          time: item.time,
          status: item.status,
          replyNote: item.replyNote || ''
        })
      }
      for (const item of hostViewInvites) {
        list.push(item)
      }
      return json(res, 200, list)
    }

    if (req.method === 'POST' && pathname === '/api/invites/respond') {
      const body = await readBody(req)
      const invite = receivedInvites.find(i => i.id === body.inviteId)
      if (!invite) return json(res, 404, { message: 'invite not found' })
      invite.status = body.status || 'pending'
      invite.replyNote = body.replyNote || ''
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && pathname === '/api/activities/create') {
      const body = await readBody(req)
      const activityId = createActivity(body)
      return json(res, 200, { activityId })
    }

    if (req.method === 'GET' && pathname === '/api/activities/detail') {
      const activityId = url.searchParams.get('activityId') || ''
      const activity = getActivityById(activityId)
      if (!activity) return json(res, 404, { message: 'activity not found' })
      return json(res, 200, activity)
    }

    if (req.method === 'POST' && pathname === '/api/activities/join') {
      const body = await readBody(req)
      const activityId = body.activityId || ''
      const participantName = body.participantName || ''
      if (!activityId || !participantName) {
        return json(res, 400, { message: 'activityId and participantName required' })
      }
      const result = joinActivity(activityId, participantName)
      if (!result.ok) return json(res, 404, { message: 'activity not found' })
      return json(res, 200, { ok: true })
    }

    if (req.method === 'GET' && pathname === '/api/notifications/host') {
      return json(res, 200, hostNotifications)
    }

    return json(res, 404, { message: 'not found' })
  } catch (err) {
    return json(res, 500, { message: err && err.message ? err.message : 'server error' })
  }
})

server.listen(3000, '0.0.0.0', () => {
  console.log(`api on 3000 (HTTP, behind reverse proxy)`)
})
