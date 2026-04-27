import express from 'express'
import cors from 'cors'
const app=express()
app.use(cors())
app.use(express.json())

app.get('/',(req,res)=>{
    res.send('Welcome to Postly Backend!')
})
app.get('/health',(req,res)=>{
    res.send('OK')
})
export default app